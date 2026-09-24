import SwiftUI
import WidgetKit

// Today's session and the weekly streak at a glance. Tapping opens Today.
@main
struct FieldworkWidgets: WidgetBundle {
    var body: some Widget { TodayWidget() }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: GlanceProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(for: .widget) { FW.Palette.bg }
        }
        .configurationDisplayName("Today")
        .description("Today’s session and your weekly streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct GlanceEntry: TimelineEntry {
    let date: Date
    let glance: Glance?
}

struct GlanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> GlanceEntry { .init(date: .now, glance: .sample) }
    func getSnapshot(in context: Context, completion: @escaping (GlanceEntry) -> Void) {
        completion(.init(date: .now, glance: context.isPreview ? .sample : Glance.load() ?? .sample))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<GlanceEntry>) -> Void) {
        // The app reloads the widget when Today changes; midnight rolls the
        // day over so yesterday's session never shows as today's.
        let midnight = Calendar.current.startOfDay(for: .now.addingTimeInterval(86400))
        completion(Timeline(entries: [.init(date: .now, glance: Glance.load())], policy: .after(midnight)))
    }
}

struct TodayWidgetView: View {
    let entry: GlanceEntry
    @Environment(\.widgetFamily) private var family

    private var glance: Glance? {
        guard let g = entry.glance, g.date == Self.day(entry.date) else { return nil }
        return g
    }

    static func day(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    var body: some View {
        switch family {
        case .accessoryRectangular: rectangular
        default: tile
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(glance?.done == true ? "Done today" : "Today").font(.caption2.weight(.semibold)).textCase(.uppercase)
            Text(glance?.title ?? "A free day").font(.headline).lineLimit(2)
            if let s = glance?.streak, s > 0 { Text("\(s)-week streak").font(.caption2) }
        }
        .widgetURL(URL(string: "fieldwork://today"))
    }

    private var tile: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text((glance?.done == true ? "Done today" : "Today").uppercased())
                    .font(.custom("IBMPlexMono-Regular", size: 10))
                    .tracking(1)
                    .foregroundStyle(FW.Palette.text3)
                Spacer()
                if let s = glance?.streak, s > 0 {
                    Text("\(s)w").font(.custom("IBMPlexMono-Regular", size: 10)).foregroundStyle(FW.Palette.accent)
                }
            }
            Spacer(minLength: 6)
            Text(glance?.title ?? "A free day")
                .font(.custom("NewsreaderDisplay-Regular", size: family == .systemSmall ? 19 : 22))
                .foregroundStyle(FW.Palette.text)
                .lineLimit(family == .systemSmall ? 3 : 2)
                .minimumScaleFactor(0.85)
            if let m = glance?.minutes, glance?.title != nil {
                Text("\(m) min" + (glance?.track.map { " · \($0.capitalized)" } ?? ""))
                    .font(.custom("InstrumentSans-Medium", size: 12))
                    .foregroundStyle(FW.Palette.text2)
                    .padding(.top, 4)
            }
            Spacer(minLength: 8)
            if let week = glance?.week, week.count == 7 {
                HStack(spacing: 5) {
                    ForEach(0..<7, id: \.self) { i in
                        Circle()
                            .fill(week[i] == true ? FW.Palette.accent : week[i] == false ? FW.Palette.surface3 : .clear)
                            .strokeBorder(week[i] == nil ? FW.Palette.line3 : .clear, lineWidth: 1)
                            .frame(width: 7, height: 7)
                    }
                }
            }
        }
        .widgetURL(URL(string: "fieldwork://today"))
    }
}
