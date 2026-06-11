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
    private var panel: NSPanel?
    private var statusLabel: NSTextField?
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
        setupPanel()
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
        menu.addItem(NSMenuItem(title: "顯示浮動面板", action: #selector(showPanel), keyEquivalent: "p"))
        menu.addItem(NSMenuItem(title: "重新框選範圍", action: #selector(reselectRegion), keyEquivalent: "r"))
        menu.addItem(NSMenuItem(title: "測試拍一張", action: #selector(captureNow), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "開啟儲存資料夾", action: #selector(openFolder), keyEquivalent: "o"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "結束", action: #selector(quit), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    private func setupPanel() {
        let panel = NSPanel(
            contentRect: NSRect(x: 120, y: 120, width: 340, height: 168),
            styleMask: [.titled, .closable, .utilityWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = "繪本S鍵截圖"
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let root = NSView(frame: NSRect(x: 0, y: 0, width: 340, height: 168))

        let title = NSTextField(labelWithString: "翻頁後按 S，或按「拍一張」")
        title.font = .boldSystemFont(ofSize: 17)
        title.frame = NSRect(x: 18, y: 122, width: 304, height: 26)
        root.addSubview(title)

        let status = NSTextField(labelWithString: "尚未框選範圍")
        status.textColor = .secondaryLabelColor
        status.frame = NSRect(x: 18, y: 94, width: 304, height: 22)
        root.addSubview(status)
        statusLabel = status

        let capture = NSButton(title: "拍一張", target: self, action: #selector(captureNow))
        capture.bezelStyle = .rounded
        capture.frame = NSRect(x: 18, y: 48, width: 94, height: 32)
        root.addSubview(capture)

        let select = NSButton(title: "重選範圍", target: self, action: #selector(reselectRegion))
        select.bezelStyle = .rounded
        select.frame = NSRect(x: 123, y: 48, width: 94, height: 32)
        root.addSubview(select)

        let folder = NSButton(title: "開資料夾", target: self, action: #selector(openFolder))
        folder.bezelStyle = .rounded
        folder.frame = NSRect(x: 228, y: 48, width: 94, height: 32)
        root.addSubview(folder)

        let quitButton = NSButton(title: "結束", target: self, action: #selector(quit))
        quitButton.bezelStyle = .rounded
        quitButton.frame = NSRect(x: 228, y: 12, width: 94, height: 28)
        root.addSubview(quitButton)

        panel.contentView = root
        panel.makeKeyAndOrderFront(nil)
        self.panel = panel
    }

    @objc private func showPanel() {
        panel?.makeKeyAndOrderFront(nil)
        panel?.orderFrontRegardless()
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
        updateStatus("範圍已設定。回電子書翻頁後按 S。")
        showPanel()
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
        let pageText = String(format: "%02d", page)
        let url = outputDir.appendingPathComponent("\(prefix)-page-\(pageText).jpg")
        let result = runScreenCapture(rect: rect, output: url)
        if result {
            page += 1
            updateStatus("已存：\(url.lastPathComponent)")
            showPanel()
            NSSound(named: "Glass")?.play()
        } else {
            updateStatus("沒有存成功。請檢查螢幕錄製權限。")
            showPanel()
            NSSound.beep()
        }
    }

    private func runScreenCapture(rect: CGRect, output: URL) -> Bool {
        let rectangle = "\(Int(rect.origin.x)),\(Int(rect.origin.y)),\(Int(rect.width)),\(Int(rect.height))"
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-x", "-t", "jpg", "-R", rectangle, output.path]
        do {
            try? FileManager.default.removeItem(at: output)
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return false }
            let values = try output.resourceValues(forKeys: [.fileSizeKey])
            return (values.fileSize ?? 0) > 0
        } catch {
            return false
        }
    }

    private func updateStatus(_ message: String) {
        statusItem.button?.title = "繪本 \(page - 1)"
        statusLabel?.stringValue = message
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
