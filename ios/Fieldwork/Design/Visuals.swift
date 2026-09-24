import Charts
import SwiftUI

// Native renderers for the tutor's visual vocabulary (src/lib/viz/schema.ts),
// drawn with the app's tokens like src/components/viz/*. Specs come from a
// model, so every accessor tolerates missing or malformed data.
struct VisualView: View {
    let spec: JSON

    static let labels: [String: String] = [
        "bar": "bar chart", "line": "line chart", "waterfall": "bridge", "flow": "process", "timeline": "timeline",
        "compare": "comparison", "matrix": "matrix", "concepts": "concept map", "stat": "figures", "statement": "statement",
        "sim": "model", "spectrum": "spectrum", "cycle": "cycle", "tree": "hierarchy", "parts": "breakdown",
        "balance": "balance", "venn": "overlap",
    ]

    var body: some View {
        let type = spec["type"]?.string ?? ""
        if Self.labels[type] != nil {
            VStack(alignment: .leading, spacing: 12) {
                if let title = spec["title"]?.string, !title.isEmpty {
                    Text(title).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text)
                }
                graphic(type)
                if let t = spec["takeaway"]?.string, !t.isEmpty {
                    Text(t).font(.sans(14)).foregroundStyle(FW.Palette.text2)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg).strokeBorder(FW.Palette.line))
            .accessibilityElement(children: .combine)
            .accessibilityLabel([spec["title"]?.string ?? Self.labels[type]!, spec["takeaway"]?.string ?? ""].filter { !$0.isEmpty }.joined(separator: ". "))
        }
    }

    @ViewBuilder private func graphic(_ type: String) -> some View {
        switch type {
        case "bar": BarViz(spec: spec)
        case "line": LineViz(spec: spec)
        case "waterfall": WaterfallViz(spec: spec)
        case "flow": FlowViz(spec: spec)
        case "timeline": TimelineViz(spec: spec)
        case "compare": CompareViz(spec: spec)
        case "matrix": MatrixViz(spec: spec)
        case "concepts": ConceptsViz(spec: spec)
        case "stat": StatViz(spec: spec)
        case "statement": StatementViz(spec: spec)
        case "sim": SimViz(spec: spec)
        case "spectrum": SpectrumViz(spec: spec)
        case "cycle": CycleViz(spec: spec)
        case "tree": TreeViz(spec: spec)
        case "parts": PartsViz(spec: spec)
        case "balance": BalanceViz(spec: spec)
        case "venn": VennViz(spec: spec)
        default: EmptyView()
        }
    }
}

// MARK: - Helpers

func tone(_ t: JSON?) -> Color {
    switch t?.string {
    case "accent": FW.Palette.accent
    case "positive": FW.Palette.positive
    case "negative": FW.Palette.negative
    case "muted": FW.Palette.text4
    default: FW.Palette.text2
    }
}

private extension JSON {
    var items: [JSON] { array ?? [] }
    func str(_ k: String) -> String { self[k]?.string ?? "" }
    func num(_ k: String, _ d: Double = 0) -> Double { self[k]?.number.flatMap { $0.isFinite ? $0 : nil } ?? d }
}

// "$" (and €£¥) prefix, "%" suffix, anything else after a space; ≥1M collapses.
func fmt(_ v: Double, _ unit: String = "", compact: Bool = false, sign: Bool = false) -> String {
    guard v.isFinite else { return "—" }
    let u = unit.trimmingCharacters(in: .whitespaces)
    let a = abs(v)
    let m: String
    if a >= 1e9 { m = (a / 1e9).formatted(.number.precision(.fractionLength(0...1))) + "B" }
    else if a >= 1e6 { m = (a / 1e6).formatted(.number.precision(.fractionLength(0...1))) + "M" }
    else if compact, a >= 1e4 { m = (a / 1e3).formatted(.number.precision(.fractionLength(0))) + "k" }
    else if compact, a >= 1e3 { m = (a / 1e3).formatted(.number.precision(.fractionLength(0...1))) + "k" }
    else { m = a.formatted(.number.precision(.fractionLength(0...(a >= 100 ? 0 : a >= 10 ? 1 : 2)))) }
    let s = v < 0 ? "−" : sign && v > 0 ? "+" : ""
    if ["$", "€", "£", "¥"].contains(u) { return "\(s)\(u)\(m)" }
    if u == "%" { return "\(s)\(m)%" }
    return u.isEmpty ? "\(s)\(m)" : "\(s)\(m) \(u)"
}

// MARK: - Charts

private struct BarViz: View {
    let spec: JSON
    var body: some View {
        let unit = spec.str("unit")
        let bars = spec["bars"]?.items ?? []
        let top = max(bars.map { $0.num("value") }.max() ?? 1, 0.0001)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(bars.enumerated()), id: \.offset) { _, b in
                let value = b.num("value"), pending = b["pending"]?.number ?? 0
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(b.str("label")).font(.sans(13)).foregroundStyle(FW.Palette.text2)
                        Spacer()
                        Text(fmt(value, unit)).font(.mono(12)).foregroundStyle(FW.Palette.text).monospacedDigit()
                    }
                    GeometryReader { geo in
                        let w = geo.size.width * max(0, value) / top
                        let pw = geo.size.width * max(0, min(pending, value)) / top
                        ZStack(alignment: .leading) {
                            Capsule().fill(FW.Palette.surface2)
                            Capsule().fill(tone(b["tone"])).frame(width: max(0, w - pw))
                            if pw > 0 {
                                Hatch().fill(tone(b["tone"]).opacity(0.55)).frame(width: pw).offset(x: w - pw)
                            }
                        }
                    }
                    .frame(height: 10)
                    if let note = b["note"]?.string, !note.isEmpty {
                        Text(note).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    }
                }
            }
        }
    }
}

private struct Hatch: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = rect.minX - rect.height
        while x < rect.maxX {
            p.move(to: .init(x: x, y: rect.maxY))
            p.addLine(to: .init(x: x + rect.height, y: rect.minY))
            x += 4
        }
        return p.strokedPath(.init(lineWidth: 1.5)).intersection(Path(rect))
    }
}

private struct LineViz: View {
    let spec: JSON
    var body: some View {
        let unit = spec.str("unit")
        let series = spec["series"]?.items ?? []
        let annotations = spec["annotations"]?.items ?? []
        Chart {
            ForEach(Array(series.enumerated()), id: \.offset) { si, s in
                ForEach(Array((s["points"]?.items ?? []).enumerated()), id: \.offset) { _, p in
                    LineMark(x: .value("x", p.str("x")), y: .value("y", p.num("y")), series: .value("series", "\(si)"))
                        .foregroundStyle(tone(s["tone"]))
                        .lineStyle(StrokeStyle(lineWidth: 2, dash: s["dashed"]?.bool == true ? [5, 4] : []))
                        .interpolationMethod(.monotone)
                }
            }
            ForEach(Array(annotations.enumerated()), id: \.offset) { _, a in
                RuleMark(x: .value("x", a.str("x")))
                    .foregroundStyle(FW.Palette.line3)
                    .annotation(position: .top, alignment: .leading) {
                        Text(a.str("label")).font(.sans(11)).foregroundStyle(FW.Palette.text3)
                    }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { v in
                AxisGridLine().foregroundStyle(FW.Palette.line)
                AxisValueLabel { if let d = v.as(Double.self) { Text(fmt(d, unit, compact: true)).font(.mono(10)) } }
            }
        }
        .chartXAxis { AxisMarks { _ in AxisValueLabel().font(.mono(10)) } }
        .frame(height: 190)
        if series.count > 1 {
            HStack(spacing: 14) {
                ForEach(Array(series.enumerated()), id: \.offset) { _, s in
                    HStack(spacing: 6) {
                        Capsule().fill(tone(s["tone"])).frame(width: 14, height: 3)
                        Text(s.str("name")).font(.sans(12)).foregroundStyle(FW.Palette.text2)
                    }
                }
            }
        }
    }
}

private struct WaterfallViz: View {
    let spec: JSON
    var body: some View {
        let unit = spec.str("unit")
        let start = spec["start"] ?? .null
        let steps = spec["steps"]?.items ?? []
        var running = start.num("value")
        var rows: [(String, Double, Double, Double, Color)] = [(start.str("label"), 0, running, running, FW.Palette.text2)]
        for s in steps {
            let d = s.num("delta")
            rows.append((s.str("label"), running, running + d, d, d >= 0 ? FW.Palette.positive : FW.Palette.negative))
            running += d
        }
        rows.append((spec.str("end_label"), 0, running, running, FW.Palette.accent))
        let lo = min(0, rows.map { min($0.1, $0.2) }.min() ?? 0)
        let hi = max(rows.map { max($0.1, $0.2) }.max() ?? 1, lo + 0.0001)
        return VStack(spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                HStack(spacing: 10) {
                    Text(r.0).font(.sans(13)).foregroundStyle(FW.Palette.text2).frame(width: 110, alignment: .leading).lineLimit(2)
                    GeometryReader { geo in
                        let x0 = (min(r.1, r.2) - lo) / (hi - lo) * geo.size.width
                        let x1 = (max(r.1, r.2) - lo) / (hi - lo) * geo.size.width
                        RoundedRectangle(cornerRadius: 3).fill(r.4).frame(width: max(2, x1 - x0), height: 14).offset(x: x0)
                    }
                    .frame(height: 14)
                    Text(i == 0 || i == rows.count - 1 ? fmt(r.3, unit, compact: true) : fmt(r.3, unit, compact: true, sign: true))
                        .font(.mono(11)).foregroundStyle(FW.Palette.text).monospacedDigit().frame(width: 64, alignment: .trailing)
                }
            }
        }
    }
}

private struct StatViz: View {
    let spec: JSON
    var body: some View {
        let items = spec["items"]?.items ?? []
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)], alignment: .leading, spacing: 16) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, s in
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.str("label")).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    Text(s.str("value")).font(.display(28)).foregroundStyle(s["tone"]?.string == "default" ? FW.Palette.text : tone(s["tone"]))
                        .minimumScaleFactor(0.6).lineLimit(1)
                    if let d = s["delta"]?.string, !d.isEmpty {
                        Text(d).font(.mono(11)).foregroundStyle(FW.Palette.text2)
                    }
                }
            }
        }
    }
}

private struct StatementViz: View {
    let spec: JSON
    var body: some View {
        let unit = spec.str("unit")
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array((spec["sections"]?.items ?? []).enumerated()), id: \.offset) { _, section in
                VStack(alignment: .leading, spacing: 6) {
                    if let h = section["heading"]?.string, !h.isEmpty { Kicker(h) }
                    ForEach(Array((section["rows"]?.items ?? []).enumerated()), id: \.offset) { _, row in
                        let emphasis = row.str("emphasis")
                        let v = row.num("value")
                        HStack {
                            Text(row.str("label")).font(.sans(14, emphasis == "normal" ? .regular : .semibold))
                            Spacer()
                            Text(v < 0 ? "(\(fmt(-v, unit)))" : fmt(v, unit)).font(.mono(13, emphasis == "total" ? .medium : .regular)).monospacedDigit()
                        }
                        .foregroundStyle(emphasis == "normal" ? FW.Palette.text2 : FW.Palette.text)
                        .padding(.top, emphasis == "normal" ? 0 : 4)
                        .overlay(alignment: .top) { if emphasis != "normal" { Rule() } }
                    }
                }
            }
        }
    }
}

// MARK: - Diagrams

private struct FlowViz: View {
    let spec: JSON
    var body: some View {
        let steps = spec["steps"]?.items ?? []
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Text("\(i + 1)").font(.mono(11, .medium)).foregroundStyle(tone(s["tone"]) == FW.Palette.text2 ? FW.Palette.text : tone(s["tone"]))
                            .frame(width: 24, height: 24).background(FW.Palette.surface2, in: .circle)
                        if i < steps.count - 1 { Rectangle().fill(FW.Palette.line2).frame(width: 1).frame(minHeight: 16) }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.str("label")).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                        if let d = s["detail"]?.string, !d.isEmpty { Text(d).font(.sans(13)).foregroundStyle(FW.Palette.text2) }
                    }
                    .padding(.bottom, 12)
                }
            }
            if spec["loops"]?.bool == true {
                Label("Back to step 1", systemImage: "arrow.uturn.up").font(.sans(12)).foregroundStyle(FW.Palette.text3)
            }
        }
    }
}

private struct TimelineViz: View {
    let spec: JSON
    var body: some View {
        let events = spec["events"]?.items ?? []
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(events.enumerated()), id: \.offset) { i, e in
                HStack(alignment: .top, spacing: 12) {
                    Text(e.str("when")).font(.mono(11)).foregroundStyle(FW.Palette.text3).frame(width: 64, alignment: .trailing).padding(.top, 2)
                    VStack(spacing: 0) {
                        Circle().fill(tone(e["tone"])).frame(width: 9, height: 9).padding(.top, 5)
                        if i < events.count - 1 { Rectangle().fill(FW.Palette.line2).frame(width: 1).frame(maxHeight: .infinity) }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.str("label")).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                        if let d = e["detail"]?.string, !d.isEmpty { Text(d).font(.sans(13)).foregroundStyle(FW.Palette.text2) }
                    }
                    .padding(.bottom, 14)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct CompareViz: View {
    let spec: JSON
    var body: some View {
        let columns = spec["columns"]?.items ?? []
        let rows = spec["rows"]?.items ?? []
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .topLeading, horizontalSpacing: 14, verticalSpacing: 10) {
                GridRow {
                    Text("")
                    ForEach(Array(columns.enumerated()), id: \.offset) { _, c in
                        Text(c.str("heading")).font(.sans(13, .semibold)).foregroundStyle(c["tone"]?.string == "default" ? FW.Palette.text : tone(c["tone"]))
                    }
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                    Divider().overlay(FW.Palette.line).gridCellUnsizedAxes(.horizontal)
                    GridRow {
                        Text(r.str("label")).font(.sans(13)).foregroundStyle(FW.Palette.text3).frame(maxWidth: 110, alignment: .leading)
                        ForEach(Array((r["cells"]?.items ?? []).prefix(columns.count).enumerated()), id: \.offset) { _, cell in
                            Text(cell.string ?? "").font(.sans(14)).foregroundStyle(FW.Palette.text).frame(maxWidth: 160, alignment: .leading)
                        }
                    }
                }
            }
        }
    }
}

private struct MatrixViz: View {
    let spec: JSON
    var body: some View {
        let x = spec["x_axis"] ?? .null, y = spec["y_axis"] ?? .null
        VStack(alignment: .leading, spacing: 6) {
            Text("↑ \(y.str("label"))").font(.sans(11)).foregroundStyle(FW.Palette.text3)
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 10).strokeBorder(FW.Palette.line2)
                    Path { p in
                        p.move(to: .init(x: w / 2, y: 0)); p.addLine(to: .init(x: w / 2, y: h))
                        p.move(to: .init(x: 0, y: h / 2)); p.addLine(to: .init(x: w, y: h / 2))
                    }
                    .stroke(FW.Palette.line, style: .init(lineWidth: 1, dash: [3, 3]))
                    ForEach(Array((spec["items"]?.items ?? []).enumerated()), id: \.offset) { _, item in
                        let px = min(max(item.num("x"), 0), 1) * (w - 24) + 12
                        let py = (1 - min(max(item.num("y"), 0), 1)) * (h - 24) + 12
                        HStack(spacing: 5) {
                            Circle().fill(tone(item["tone"])).frame(width: 9, height: 9)
                            Text(item.str("label")).font(.sans(11)).foregroundStyle(FW.Palette.text).lineLimit(1).fixedSize()
                        }
                        .position(x: min(px + 30, w - 30), y: py)
                    }
                }
            }
            .frame(height: 220)
            HStack {
                Text(x.str("low")).font(.sans(11)).foregroundStyle(FW.Palette.text3)
                Spacer()
                Text("\(x.str("label")) →").font(.sans(11)).foregroundStyle(FW.Palette.text3)
                Spacer()
                Text(x.str("high")).font(.sans(11)).foregroundStyle(FW.Palette.text3)
            }
        }
    }
}

private struct ConceptsViz: View {
    let spec: JSON
    var body: some View {
        let nodes = spec["nodes"]?.items ?? []
        let edges = spec["edges"]?.items ?? []
        let label = { (id: String) in nodes.first { $0.str("id") == id }?.str("label") ?? id }
        VStack(alignment: .leading, spacing: 12) {
            FlowLayout(spacing: 8) {
                ForEach(Array(nodes.enumerated()), id: \.offset) { _, n in
                    let emphasis = n["emphasis"]?.bool == true
                    Text(n.str("label"))
                        .font(.sans(13, emphasis ? .semibold : .regular))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .foregroundStyle(emphasis ? FW.Palette.onAccent : FW.Palette.text)
                        .background(emphasis ? FW.Palette.accent : FW.Palette.surface2, in: .capsule)
                        .overlay(Capsule().strokeBorder(emphasis ? .clear : tone(n["tone"]).opacity(0.5)))
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(edges.enumerated()), id: \.offset) { _, e in
                    HStack(spacing: 6) {
                        Text(label(e.str("from"))).foregroundStyle(FW.Palette.text)
                        Text("→ \(e["label"]?.string ?? "") →").foregroundStyle(FW.Palette.text3)
                        Text(label(e.str("to"))).foregroundStyle(FW.Palette.text)
                    }
                    .font(.sans(13))
                }
            }
        }
    }
}

private struct SpectrumViz: View {
    let spec: JSON
    var body: some View {
        let markers = spec["markers"]?.items ?? []
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: [FW.Palette.surface3, FW.Palette.surface2, FW.Palette.surface3], startPoint: .leading, endPoint: .trailing)).frame(height: 6)
                    ForEach(Array(markers.enumerated()), id: \.offset) { _, m in
                        Circle().fill(tone(m["tone"])).frame(width: 14, height: 14)
                            .overlay(Circle().strokeBorder(FW.Palette.raised, lineWidth: 2))
                            .offset(x: min(max(m.num("position"), 0), 1) * (geo.size.width - 14))
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .frame(height: 18)
            HStack {
                Text(spec.str("left")); Spacer(); Text(spec.str("right"))
            }
            .font(.sans(12)).foregroundStyle(FW.Palette.text3)
            ForEach(Array(markers.sorted { $0.num("position") < $1.num("position") }.enumerated()), id: \.offset) { _, m in
                HStack(spacing: 8) {
                    Circle().fill(tone(m["tone"])).frame(width: 8, height: 8)
                    Text(m.str("label")).font(.sans(13)).foregroundStyle(FW.Palette.text)
                }
            }
        }
    }
}

// MARK: - Shapes

private struct CycleViz: View {
    let spec: JSON
    var body: some View {
        let steps = spec["steps"]?.items ?? []
        VStack(spacing: 14) {
            ZStack {
                Circle().stroke(FW.Palette.line2, style: .init(lineWidth: 1.5, dash: [4, 4])).frame(width: 150, height: 150)
                if let c = spec["centre"]?.string, !c.isEmpty {
                    Text(c).font(.serif(15, italic: true)).foregroundStyle(FW.Palette.text2).multilineTextAlignment(.center).frame(width: 110)
                }
                ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                    let a = Double(i) / Double(max(steps.count, 1)) * 2 * .pi - .pi / 2
                    Text("\(i + 1)").font(.mono(11, .medium)).foregroundStyle(FW.Palette.text)
                        .frame(width: 26, height: 26).background(FW.Palette.surface2, in: .circle)
                        .overlay(Circle().strokeBorder(tone(s["tone"]).opacity(0.6)))
                        .offset(x: cos(a) * 75, y: sin(a) * 75)
                }
            }
            .frame(height: 180)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(i + 1)").font(.mono(11)).foregroundStyle(FW.Palette.text3).frame(width: 16)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.str("label")).font(.sans(14, .medium)).foregroundStyle(FW.Palette.text)
                            if let d = s["detail"]?.string, !d.isEmpty { Text(d).font(.sans(13)).foregroundStyle(FW.Palette.text2) }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct TreeViz: View {
    let spec: JSON
    var body: some View {
        let nodes = spec["nodes"]?.items ?? []
        let root = nodes.first { $0["parent"]?.string == nil } ?? nodes.first
        VStack(alignment: .leading, spacing: 6) {
            if let root { branch(root, nodes: nodes, depth: 0) }
        }
    }
    private func branch(_ n: JSON, nodes: [JSON], depth: Int) -> AnyView {
        let children = depth < 3 ? nodes.filter { $0["parent"]?.string == n.str("id") && $0.str("id") != n.str("id") } : []
        return AnyView(VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if depth > 0 { Text("└").font(.mono(12)).foregroundStyle(FW.Palette.text4) }
                VStack(alignment: .leading, spacing: 1) {
                    Text(n.str("label")).font(.sans(depth == 0 ? 15 : 14, depth == 0 ? .semibold : .medium))
                        .foregroundStyle(n["tone"]?.string == "default" || n["tone"] == nil ? FW.Palette.text : tone(n["tone"]))
                    if let d = n["detail"]?.string, !d.isEmpty { Text(d).font(.sans(12)).foregroundStyle(FW.Palette.text2) }
                }
            }
            ForEach(Array(children.enumerated()), id: \.offset) { _, c in
                branch(c, nodes: nodes, depth: depth + 1).padding(.leading, 16)
            }
        })
    }
}

private struct PartsViz: View {
    let spec: JSON
    var body: some View {
        let unit = spec.str("unit")
        let parts = spec["parts"]?.items ?? []
        let total = max(parts.map { max(0, $0.num("value")) }.reduce(0, +), 0.0001)
        VStack(alignment: .leading, spacing: 12) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(Array(parts.enumerated()), id: \.offset) { i, p in
                        Rectangle().fill(tone(p["tone"]).opacity(p["tone"]?.string == "default" ? 0.4 + 0.6 * Double(parts.count - i) / Double(parts.count) : 1))
                            .frame(width: max(2, (geo.size.width - CGFloat(parts.count - 1) * 2) * max(0, p.num("value")) / total))
                    }
                }
                .clipShape(.rect(cornerRadius: 6))
            }
            .frame(height: 22)
            ForEach(Array(parts.enumerated()), id: \.offset) { _, p in
                HStack {
                    Text(p.str("label")).font(.sans(13)).foregroundStyle(FW.Palette.text2)
                    Spacer()
                    Text("\(fmt(p.num("value"), unit)) · \(Int((max(0, p.num("value")) / total * 100).rounded()))%")
                        .font(.mono(12)).foregroundStyle(FW.Palette.text).monospacedDigit()
                }
            }
            if let t = spec["total_label"]?.string, !t.isEmpty {
                HStack {
                    Text(t).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text)
                    Spacer()
                    Text(fmt(total, unit)).font(.mono(12, .medium)).foregroundStyle(FW.Palette.text)
                }
                .padding(.top, 4)
                .overlay(alignment: .top) { Rule() }
            }
        }
    }
}

private struct BalanceViz: View {
    let spec: JSON
    var body: some View {
        let left = spec["left"] ?? .null, right = spec["right"] ?? .null
        let weight = { (s: JSON) in (s["items"]?.items ?? []).map { min(max($0.num("weight", 1), 1), 3) }.reduce(0, +) }
        let lw = weight(left), rw = weight(right)
        let tilt = max(-8, min(8, (rw - lw) * 2))
        VStack(spacing: 14) {
            ZStack {
                Rectangle().fill(FW.Palette.text3).frame(height: 2).rotationEffect(.degrees(tilt))
                Triangle().fill(FW.Palette.text3).frame(width: 14, height: 12).offset(y: 10)
            }
            .frame(height: 30)
            HStack(alignment: .top, spacing: 16) {
                side(left, heavier: lw > rw)
                side(right, heavier: rw > lw)
            }
        }
    }
    private func side(_ s: JSON, heavier: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(s.str("label")).font(.sans(14, .semibold)).foregroundStyle(heavier ? FW.Palette.accent : FW.Palette.text)
            ForEach(Array((s["items"]?.items ?? []).enumerated()), id: \.offset) { _, i in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(String(repeating: "●", count: Int(min(max(i.num("weight", 1), 1), 3)))).font(.system(size: 6)).foregroundStyle(FW.Palette.text3)
                    Text(i.str("label")).font(.sans(13)).foregroundStyle(FW.Palette.text2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct Triangle: Shape {
    func path(in r: CGRect) -> Path {
        Path { p in p.move(to: .init(x: r.midX, y: r.minY)); p.addLine(to: .init(x: r.maxX, y: r.maxY)); p.addLine(to: .init(x: r.minX, y: r.maxY)); p.closeSubpath() }
    }
}

private struct VennViz: View {
    let spec: JSON
    var body: some View {
        let sets = Array((spec["sets"]?.items ?? []).prefix(3))
        let regions = spec["regions"]?.items ?? []
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                ForEach(Array(sets.enumerated()), id: \.offset) { i, s in
                    let offsets: [CGSize] = sets.count == 3
                        ? [.init(width: -30, height: -18), .init(width: 30, height: -18), .init(width: 0, height: 26)]
                        : [.init(width: -34, height: 0), .init(width: 34, height: 0)]
                    Circle().fill(tone(s["tone"]).opacity(0.14)).overlay(Circle().strokeBorder(tone(s["tone"]).opacity(0.7)))
                        .frame(width: 120, height: 120).offset(offsets[min(i, offsets.count - 1)])
                }
            }
            .frame(height: sets.count == 3 ? 180 : 130)
            .frame(maxWidth: .infinity)
            ForEach(Array(regions.enumerated()), id: \.offset) { _, r in
                let names = (r["sets"]?.items ?? []).compactMap { $0.int }.compactMap { sets.indices.contains($0) ? sets[$0].str("label") : nil }
                VStack(alignment: .leading, spacing: 2) {
                    Text(names.count > 1 ? names.joined(separator: " + ") : "Only \(names.first ?? "")").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                    Text((r["items"]?.items ?? []).compactMap(\.string).joined(separator: " · ")).font(.sans(14)).foregroundStyle(FW.Palette.text)
                }
            }
        }
    }
}

// MARK: - Sim

private struct SimViz: View {
    let spec: JSON
    @State private var values: [String: Double] = [:]

    var body: some View {
        let inputs = spec["inputs"]?.items ?? []
        let outputs = spec["outputs"]?.items ?? []
        let vars = Dictionary(uniqueKeysWithValues: inputs.map { ($0.str("id").lowercased(), values[$0.str("id")] ?? $0.num("value")) })
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(inputs.enumerated()), id: \.offset) { _, i in
                let id = i.str("id")
                let lo = i.num("min"), hi = max(i.num("max"), lo + 0.0001)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(i.str("label")).font(.sans(13)).foregroundStyle(FW.Palette.text2)
                        Spacer()
                        Text(fmt(values[id] ?? i.num("value"), i.str("unit"))).font(.mono(12)).monospacedDigit().foregroundStyle(FW.Palette.text)
                    }
                    Slider(value: Binding(get: { values[id] ?? i.num("value") }, set: { values[id] = $0 }), in: lo...hi, step: max(i.num("step", (hi - lo) / 100), 0.0001))
                        .tint(FW.Palette.accent)
                        .sensoryFeedback(.selection, trigger: values[id])
                }
            }
            Rule()
            ForEach(Array(outputs.enumerated()), id: \.offset) { _, o in
                let v = (try? Formula(o.str("formula")).evaluate(vars)) ?? .nan
                HStack {
                    Text(o.str("label")).font(.sans(14)).foregroundStyle(FW.Palette.text2)
                    Spacer()
                    Text(format(v, o.str("format"))).font(.display(22)).monospacedDigit()
                        .foregroundStyle(o["tone"]?.string == "default" ? FW.Palette.text : tone(o["tone"]))
                        .contentTransition(.numericText())
                        .animation(.snappy, value: v)
                }
            }
        }
    }

    private func format(_ v: Double, _ f: String) -> String {
        switch f {
        case "currency": fmt(v, "$")
        case "percent": fmt(v, "%")
        default: fmt(v)
        }
    }
}

// The sim formula language (src/lib/viz/formula.ts): numbers, input ids,
// + - * / ^ ( ), min, max, round, abs. Parsed once; no eval.
struct Formula {
    indirect enum Node {
        case num(Double), variable(String), neg(Node), bin(Character, Node, Node), call(String, [Node])
    }
    struct Invalid: Error {}
    private let root: Node

    init(_ src: String) throws {
        guard src.count <= 300 else { throw Invalid() }
        let tokens = src.matches(of: /\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|[()+\-*\/^,]|\S/).map { String($0.output) }
        var i = 0
        func peek() -> String? { i < tokens.count ? tokens[i] : nil }
        func take(_ t: String? = nil) throws -> String {
            guard i < tokens.count else { throw Invalid() }
            let tok = tokens[i]; i += 1
            if let t, tok != t { throw Invalid() }
            return tok
        }
        func expr() throws -> Node {
            var a = try term()
            while let p = peek(), p == "+" || p == "-" { let op = try take(); a = .bin(Character(op), a, try term()) }
            return a
        }
        func term() throws -> Node {
            var a = try power()
            while let p = peek(), p == "*" || p == "/" { let op = try take(); a = .bin(Character(op), a, try power()) }
            return a
        }
        func power() throws -> Node {
            let a = try unary()
            if peek() == "^" { _ = try take(); return .bin("^", a, try power()) }
            return a
        }
        func unary() throws -> Node {
            if peek() == "-" { _ = try take(); return .neg(try unary()) }
            if peek() == "+" { _ = try take() }
            return try atom()
        }
        func atom() throws -> Node {
            let t = try take()
            if t == "(" { let e = try expr(); _ = try take(")"); return e }
            if let v = Double(t), t.first?.isNumber == true { return .num(v) }
            if t.first?.isLetter == true || t.first == "_" {
                let name = t.lowercased()
                if peek() == "(" {
                    guard ["min", "max", "round", "abs"].contains(name) else { throw Invalid() }
                    _ = try take("(")
                    var args: [Node] = []
                    if peek() != ")" {
                        args.append(try expr())
                        while peek() == "," { _ = try take(); args.append(try expr()) }
                    }
                    _ = try take(")")
                    return .call(name, args)
                }
                return .variable(name)
            }
            throw Invalid()
        }
        root = try expr()
        if i < tokens.count { throw Invalid() }
    }

    func evaluate(_ vars: [String: Double]) throws -> Double { try run(root, vars) }

    private func run(_ n: Node, _ vars: [String: Double]) throws -> Double {
        switch n {
        case .num(let v): return v
        case .variable(let name):
            guard let v = vars[name] else { throw Invalid() }
            return v
        case .neg(let a): return -(try run(a, vars))
        case .call(let fn, let args):
            let a = try args.map { try run($0, vars) }
            switch fn {
            case "min": return a.min() ?? .nan
            case "max": return a.max() ?? .nan
            case "abs": return abs(a.first ?? .nan)
            default:
                let d = a.count > 1 ? a[1] : 0
                let p = pow(10, d)
                return ((a.first ?? .nan) * p).rounded() / p
            }
        case .bin(let op, let x, let y):
            let a = try run(x, vars), b = try run(y, vars)
            switch op {
            case "+": return a + b
            case "-": return a - b
            case "*": return a * b
            case "/": return a / b
            default: return pow(a, b)
            }
        }
    }
}

// Wraps children onto new lines (chips, concept nodes).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += row + spacing; row = 0 }
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
    }
}
