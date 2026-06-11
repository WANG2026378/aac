import AppKit
import ApplicationServices
import CoreGraphics

final class SelectionView: NSView {
    var startPoint: NSPoint?
    var currentRect: NSRect = .zero
    var onComplete: ((NSRect) -> Void)?

    override var acceptsFirstResponder: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedWhite: 0, alpha: 0.38).setFill()
        bounds.fill()

        guard !currentRect.isEmpty else { return }
        NSColor.clear.setFill()
        currentRect.fill(using: .clear)
        NSColor.systemYellow.setStroke()
        let path = NSBezierPath(rect: currentRect)
        path.lineWidth = 3
        path.stroke()
    }

    override func mouseDown(with event: NSEvent) {
        startPoint = event.locationInWindow
        currentRect = .zero
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let start = startPoint else { return }
        let end = event.locationInWindow
        currentRect = NSRect(
            x: min(start.x, end.x),
            y: min(start.y, end.y),
            width: abs(start.x - end.x),
            height: abs(start.y - end.y)
        )
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        guard currentRect.width > 20, currentRect.height > 20 else { return }
        onComplete?(currentRect)
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 {
            window?.close()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var eventMonitor: Any?
    private var localMonitor: Any?
    private var prefix = "picturebook"
    private var page = 1
    private var captureRect: CGRect?
    private let outputDir = URL(fileURLWithPath: NSHomeDirectory())
        .appendingPathComponent("Desktop")
        .appendingPathComponent("繪本截圖", isDirectory: true)

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
        setupStatusItem()
        requestPermissions()
        promptPrefix()
        beginSelection()
        installHotKeyMonitor()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "繪本 0"
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "按 S 擷取目前頁", action: nil, keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "重新框選範圍", action: #selector(reselectRegion), keyEquivalent: "r"))
        menu.addItem(NSMenuItem(title: "測試拍一張", action: #selector(captureNow), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "開啟儲存資料夾", action: #selector(openFolder), keyEquivalent: "o"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "結束", action: #selector(quit), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    private func requestPermissions() {
        if #available(macOS 10.15, *) {
            if !CGPreflightScreenCaptureAccess() {
                _ = CGRequestScreenCaptureAccess()
            }
        }
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }

    private func promptPrefix() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "繪本S鍵截圖"
        alert.informativeText = "請輸入這本書的檔名前綴。"
        alert.addButton(withTitle: "開始")
        alert.addButton(withTitle: "取消")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 28))
        field.stringValue = "picturebook"
        alert.accessoryView = field
        if alert.runModal() == .alertFirstButtonReturn {
            prefix = sanitize(field.stringValue)
            if prefix.isEmpty { prefix = "picturebook" }
        } else {
            NSApp.terminate(nil)
        }
    }

    @objc private func reselectRegion() {
        beginSelection()
    }

    private func beginSelection() {
        guard let screen = NSScreen.main else { return }
        NSApp.activate(ignoringOtherApps: true)

        let window = NSWindow(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.level = .screenSaver
        window.backgroundColor = .clear
        window.isOpaque = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let view = SelectionView(frame: NSRect(origin: .zero, size: screen.frame.size))
        window.contentView = view
        view.onComplete = { [weak self, weak window] rect in
            guard let self else { return }
            self.captureRect = self.cgRect(from: rect, in: screen)
            window?.close()
            self.showReadyAlert()
        }
        window.makeKeyAndOrderFront(nil)
    }

    private func cgRect(from rect: NSRect, in screen: NSScreen) -> CGRect {
        let x = screen.frame.origin.x + rect.origin.x
        let y = screen.frame.maxY - rect.maxY
        return CGRect(x: x, y: y, width: rect.width, height: rect.height).integral
    }

    private func showReadyAlert() {
        statusItem.button?.title = "繪本 \(page - 1)"
        let alert = NSAlert()
        alert.messageText = "設定完成"
        alert.informativeText = "回到電子書翻頁。每翻一頁按 S，就會自動存成下一張。"
        alert.addButton(withTitle: "知道了")
        alert.runModal()
    }

    private func installHotKeyMonitor() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handle(event: event)
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handle(event: event)
            return event
        }
    }

    private func handle(event: NSEvent) {
        guard event.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return }
        guard event.charactersIgnoringModifiers?.lowercased() == "s" else { return }
        captureNow()
    }

    @objc private func captureNow() {
        guard let rect = captureRect else {
            beginSelection()
            return
        }
        guard let image = CGWindowListCreateImage(rect, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution]) else {
            NSSound.beep()
            return
        }
        let pageText = String(format: "%02d", page)
        let url = outputDir.appendingPathComponent("\(prefix)-page-\(pageText).jpg")
        let rep = NSBitmapImageRep(cgImage: image)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92]) else {
            NSSound.beep()
            return
        }
        do {
            try data.write(to: url)
            page += 1
            statusItem.button?.title = "繪本 \(page - 1)"
            NSSound(named: "Glass")?.play()
        } catch {
            NSSound.beep()
        }
    }

    @objc private func openFolder() {
        NSWorkspace.shared.open(outputDir)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private func sanitize(_ value: String) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        return value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .map { char -> String in
                let scalar = String(char).unicodeScalars.first
                if let scalar, allowed.contains(scalar) { return String(char) }
                if char == " " { return "-" }
                return String(char)
            }
            .joined()
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
