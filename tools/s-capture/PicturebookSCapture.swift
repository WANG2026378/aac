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
    private var autoTimer: Timer?
    private var isAutoRunning = false
    private var autoRemaining = 0
    private var prefix = "picturebook"
    private var page = 1
    private var captureRect: CGRect?
    private let outputDir = URL(fileURLWithPath: NSHomeDirectory())
        .appendingPathComponent("Desktop")
        .appendingPathComponent("繪本截圖", isDirectory: true)

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
        setupStatusItem()
        requestPermissions()
        promptPrefix()
        beginSelection()
        installHotKeyMonitor()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "📸"
        statusItem.button?.toolTip = "繪本上方截圖：按 S 拍照"
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "上方工具已啟動：按 S 拍照", action: nil, keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "重新框選範圍", action: #selector(reselectRegion), keyEquivalent: "r"))
        menu.addItem(NSMenuItem(title: "拍一張", action: #selector(captureNow), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "開始自動翻頁拍照", action: #selector(startAutoCapture), keyEquivalent: "a"))
        menu.addItem(NSMenuItem(title: "停止自動拍照", action: #selector(stopAutoCapture), keyEquivalent: "."))
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
        alert.messageText = "繪本上方截圖"
        alert.informativeText = "請輸入這本書的檔名前綴。啟動後工具會掛在上方選單列。"
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
        updateStatus("範圍已設定。按 S 拍照，或從上方選單開始自動翻頁拍照。")
        notify("範圍已設定。按 S 拍照。")
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
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "s":
            captureNow()
        case ".":
            stopAutoCapture()
        default:
            return
        }
    }

    @objc private func captureNow() {
        _ = captureOne(showError: true)
    }

    @discardableResult
    private func captureOne(showError: Bool) -> Bool {
        guard let rect = captureRect else {
            beginSelection()
            return false
        }
        let pageText = String(format: "%02d", page)
        let url = outputDir.appendingPathComponent("\(prefix)-page-\(pageText).jpg")
        let result = runScreenCapture(rect: rect, output: url)
        if result {
            page += 1
            updateStatus("已存：\(url.lastPathComponent)")
            notify("已存：\(url.lastPathComponent)")
            NSSound(named: "Glass")?.play()
            return true
        } else {
            updateStatus("沒有存成功。請檢查螢幕錄製權限。")
            if showError {
                notify("沒有存成功，請檢查螢幕錄製權限。")
                NSSound.beep()
            }
            return false
        }
    }

    @objc private func startAutoCapture() {
        guard captureRect != nil else {
            beginSelection()
            return
        }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "自動翻頁拍照"
        alert.informativeText = "要自動拍幾頁？工具會拍一張、按右方向鍵翻頁、等待 1.2 秒，再拍下一張。"
        alert.addButton(withTitle: "開始")
        alert.addButton(withTitle: "取消")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 28))
        field.stringValue = "10"
        alert.accessoryView = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        autoRemaining = max(1, Int(field.stringValue) ?? 10)
        isAutoRunning = true
        updateStatus("自動拍照中：剩 \(autoRemaining) 頁")
        notify("自動翻頁拍照開始。按 . 可停止。")
        scheduleAutoCapture(delay: 0.2)
    }

    @objc private func stopAutoCapture() {
        autoTimer?.invalidate()
        autoTimer = nil
        isAutoRunning = false
        autoRemaining = 0
        updateStatus("自動拍照已停止")
        notify("自動拍照已停止。")
    }

    private func scheduleAutoCapture(delay: TimeInterval) {
        autoTimer?.invalidate()
        autoTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            self?.autoStep()
        }
    }

    private func autoStep() {
        guard isAutoRunning, autoRemaining > 0 else {
            stopAutoCapture()
            return
        }
        if captureOne(showError: false) {
            autoRemaining -= 1
            if autoRemaining <= 0 {
                stopAutoCapture()
                return
            }
            sendRightArrow()
            updateStatus("自動拍照中：剩 \(autoRemaining) 頁")
            scheduleAutoCapture(delay: 1.2)
        } else {
            stopAutoCapture()
            updateStatus("自動拍照失敗，已停止")
        }
    }

    private func sendRightArrow() {
        let source = CGEventSource(stateID: .hidSystemState)
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 124, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 124, keyDown: false)
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)
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
        statusItem.button?.title = "📸 \(page - 1)"
        statusItem.button?.toolTip = message
    }

    private func notify(_ message: String) {
        let notification = NSUserNotification()
        notification.title = "繪本上方截圖"
        notification.informativeText = message
        NSUserNotificationCenter.default.deliver(notification)
    }

    @objc private func openFolder() {
        NSWorkspace.shared.open(outputDir)
    }

    @objc private func quit() {
        stopAutoCapture()
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
