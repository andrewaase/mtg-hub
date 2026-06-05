import Foundation
import Capacitor
import Vision
import UIKit

/// Capacitor plugin that exposes iOS Vision framework text recognition to JavaScript.
/// Used by the Mana Mint native card scanner for fast on-device OCR.
@objc(TextScannerPlugin)
public class TextScannerPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "TextScannerPlugin"
    public let jsName     = "TextScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scanBase64", returnType: CAPPluginReturnPromise),
    ]

    /// Scan a base64-encoded JPEG/PNG image and return recognized text.
    ///
    /// Call from JS:
    ///   const { text, lines, topText } = await TextScanner.scanBase64({ base64: '...' })
    ///
    /// - text:    full concatenated OCR text
    /// - lines:   array of individual text lines, top-of-image first
    /// - topText: text found in the top 30 % of the image (where MTG card names live)
    @objc func scanBase64(_ call: CAPPluginCall) {
        guard
            let base64    = call.getString("base64"),
            let imageData = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
            let uiImage   = UIImage(data: imageData),
            let cgImage   = uiImage.cgImage
        else {
            call.reject("Invalid or missing base64 image data")
            return
        }

        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                call.reject("Vision error: \(error.localizedDescription)")
                return
            }

            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                call.resolve(["text": "", "lines": [], "topText": ""])
                return
            }

            // Vision uses a bottom-left coordinate system.
            // Sort descending by maxY so lines at the TOP of the image come first.
            let sorted = observations.sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }

            let lines: [String] = sorted.compactMap {
                $0.topCandidates(1).first?.string
            }

            // Top 30 % of image = boundingBox.minY > 0.70 in Vision coords
            let topLines: [String] = sorted
                .filter { $0.boundingBox.minY > 0.70 }
                .compactMap { $0.topCandidates(1).first?.string }

            call.resolve([
                "text":    lines.joined(separator: "\n"),
                "lines":   lines,
                "topText": topLines.joined(separator: " "),
            ])
        }

        // .fast = ~50 ms, .accurate = ~200 ms but higher quality
        // We use .fast first; the JS layer can retry with accurate if confidence is low.
        request.recognitionLevel      = .fast
        request.usesLanguageCorrection = false   // disable autocorrect — card names aren't real words

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                call.reject("Handler error: \(error.localizedDescription)")
            }
        }
    }
}
