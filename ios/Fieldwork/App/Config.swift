import Foundation

// Everything here is public: the web app ships the same values in its
// JavaScript. Secrets (AI keys, the APNs key, the Supabase service key) stay
// on the server in Vercel's environment and never reach the app.
enum Config {
    // The app always talks to production; it's a personal app.
    static let site = URL(string: "https://edu.nhorowitz.co")!
    static let supabaseURL = URL(string: "https://xlxkbznypzlztxpyqvcu.supabase.co")!
    static let supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhseGtiem55cHpsenR4cHlxdmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTg3MzUsImV4cCI6MjEwNTU5NDczNX0.D9NPf6wIQHWzkRrO4g_8JPje9GGBvhDhNPCR2Op_vVM"
    // Passkeys belong to the web domain (see apple-app-site-association).
    static let relyingParty = "edu.nhorowitz.co"
    static let appGroup = "group.co.nhorowitz.fieldwork"
    // Supabase Auth's email OTP length; matches CODE_LENGTH on the web.
    static let codeLength = 8
}
