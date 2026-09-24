import Foundation

// The iPhone side of src/lib/client/api.ts: the same routes on
// edu.nhorowitz.co, authenticated with the Supabase access token instead of
// cookies. Errors carry the server's own message ({error}), as on the web.
struct APIError: LocalizedError, Sendable {
    let message: String
    let status: Int
    var errorDescription: String? { message }

    static let offline = APIError(message: "You’re offline. This needs a connection.", status: 0)
}

// The account whose data the app has cached; the server rejects a request
// with 409 if the token belongs to someone else.
@MainActor enum Owner { static var id: String? }

enum API {
    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 60
        c.timeoutIntervalForResource = 300
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    static func request(_ path: String, method: String, body: Data?) async throws -> URLRequest {
        var req = URLRequest(url: URL(string: path, relativeTo: Config.site)!)
        req.httpMethod = method
        req.setValue("Bearer \(try await Auth.accessToken())", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("FieldworkiOS/1", forHTTPHeaderField: "X-Fieldwork-Client")
        if let owner = await MainActor.run(body: { Owner.id }) { req.setValue(owner, forHTTPHeaderField: "X-Fieldwork-Owner") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        return req
    }

    static func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(path, method: "GET", body: nil)
    }

    static func post<T: Decodable>(_ path: String, _ body: some Encodable, method: String = "POST", as type: T.Type = T.self) async throws -> T {
        try await send(path, method: method, body: try JSONEncoder.api.encode(body))
    }

    @discardableResult
    static func delete(_ path: String) async throws -> JSON {
        try await send(path, method: "DELETE", body: nil)
    }

    // Some DELETE routes take a JSON body (memory, notes, shares, account).
    @discardableResult
    static func delete(_ path: String, _ body: some Encodable) async throws -> JSON {
        try await send(path, method: "DELETE", body: try JSONEncoder.api.encode(body))
    }

    private static func send<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        #if DEBUG
        if Demo.on {
            try? await Task.sleep(for: .milliseconds(250))
            return try JSONDecoder.api.decode(T.self, from: Demo.fixture(path, method: method, body: body) ?? Data("{}".utf8))
        }
        #endif
        var (data, status) = try await fetch(path, method: method, body: body)
        if status == 401, await Auth.refresh() {
            (data, status) = try await fetch(path, method: method, body: body)
        }
        if status == 401 { await Auth.expired() }
        guard (200..<300).contains(status) else { throw failure(data, status: status) }
        do {
            return try JSONDecoder.api.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("Decode \(path):", error)
            #endif
            throw APIError(message: "The server sent an unexpected response.", status: status)
        }
    }

    private static func fetch(_ path: String, method: String, body: Data?) async throws -> (Data, Int) {
        let req = try await request(path, method: method, body: body)
        do {
            let (data, response) = try await session.data(for: req)
            return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        } catch let e as URLError where e.code == .cancelled {
            throw CancellationError()
        } catch {
            throw reachability(error, fallback: "Couldn’t reach the server. Try again.")
        }
    }

    static func failure(_ data: Data, status: Int) -> APIError {
        if let json = try? JSONDecoder.api.decode(JSON.self, from: data), let message = json["error"]?.string {
            return APIError(message: message, status: status)
        }
        return APIError(
            message: status == 504 ? "That took too long. Try again."
                : status == 413 ? "That’s too large to send."
                : status >= 500 ? "Something went wrong on our side. Try again."
                : "That didn’t work. Try again.",
            status: status
        )
    }

    static func reachability(_ error: Error, fallback: String) -> APIError {
        if let e = error as? URLError, [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed].contains(e.code) {
            return .offline
        }
        return APIError(message: fallback, status: 0)
    }
}

// NDJSON streams ({t:'snap'|'meta'|'plan'|'done'|'error'}), as read by
// stream() on the web. Snapshots are the partial final object; the stream
// resolves with the 'done' payload.
struct StreamHandlers: Sendable {
    var onSnap: (@MainActor @Sendable (JSON) -> Void)?
    var onMeta: (@MainActor @Sendable (JSON) -> Void)?
    var onPlan: (@MainActor @Sendable (JSON) -> Void)?
}

extension API {
    static func stream(_ path: String, _ body: some Encodable, handlers: StreamHandlers = .init()) async throws -> JSON {
        do {
            return try await streamOnce(path, body, handlers: handlers)
        } catch let e as APIError where e.status == 401 {
            guard await Auth.refresh() else { await Auth.expired(); throw e }
            return try await streamOnce(path, body, handlers: handlers)
        }
    }

    private static func streamOnce(_ path: String, _ body: some Encodable, handlers: StreamHandlers) async throws -> JSON {
        #if DEBUG
        if Demo.on {
            try? await Task.sleep(for: .milliseconds(900))
            return Demo.streamed(path, body: try JSONEncoder.api.encode(body))
        }
        #endif
        let req = try await request(path, method: "POST", body: try JSONEncoder.api.encode(body))
        let bytes: URLSession.AsyncBytes, response: URLResponse
        do {
            (bytes, response) = try await session.bytes(for: req)
        } catch let e as URLError where e.code == .cancelled {
            throw CancellationError()
        } catch {
            throw reachability(error, fallback: "Couldn’t reach the tutor. Try again.")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var data = Data()
            for try await b in bytes { data.append(b) }
            throw failure(data, status: status)
        }
        var done: JSON?
        do {
            for try await line in bytes.lines {
                guard !line.isEmpty, let event = try? JSONDecoder.api.decode(JSON.self, from: Data(line.utf8)) else { continue }
                switch event["t"]?.string {
                case "snap": if let d = event["data"] { await handlers.onSnap?(d) }
                case "meta": await handlers.onMeta?(event)
                case "plan": if let d = event["data"] { await handlers.onPlan?(d) }
                case "done": done = event["data"] ?? .null
                case "error":
                    throw APIError(message: event["message"]?.string ?? "Something went wrong.", status: event["status"]?.int ?? 500)
                default: break
                }
            }
        } catch let e as APIError {
            throw e
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw reachability(error, fallback: "The response ended early. Try again.")
        }
        guard let done else { throw APIError(message: "The response ended early. Try again.", status: 502) }
        return done
    }
}
