// ═══════════════════════════════════════════════════════════════════
//  Storefront — share modal (Web Share API + QR/print fallback)
//  and the barcode scanner modal.
// ═══════════════════════════════════════════════════════════════════
import { state } from "./state.js";
import { getById, showToast } from "./utils.js";
import { updateCartUI } from "./cart.js";

// ─────────────────────────────────────────────────────
//  SHARE (Web Share API + fallback modal with copy link & QR)
// ─────────────────────────────────────────────────────
// Share strategy:
// 1) Try native Web Share API.
// 2) Fallback to in-app modal with copy link + QR + print QR.
function renderShareQR() {
  const url = window.location.href;
  QRCode.toCanvas(document.getElementById("share-qr-canvas"), url, {
    width: 220, margin: 1,
    color: { dark: "#1a3a5c", light: "#ffffff" },
  }, err => { if (err) console.error("QR generation failed:", err); });
  return url;
}

function openShareModal() {
  const url = renderShareQR();
  const input = getById("share-url-input");
  if (input) input.value = url;
  getById("share-qr-url-text").textContent = url;
  getById("share-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeShareModal() {
  getById("share-modal").classList.remove("open");
  document.body.style.overflow = "";
}

async function handleShare() {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({
        title: "NNBC Snack Bar",
        text: "Order snacks from the NNBC Snack Bar!",
        url,
      });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled native share sheet
      console.error("Share failed:", e);
      // fall through to modal on other errors
    }
  }
  openShareModal();
}

getById("share-btn").addEventListener("click", handleShare);
getById("close-share").addEventListener("click", closeShareModal);
getById("share-modal").addEventListener("click", e => {
  if (e.target === getById("share-modal")) closeShareModal();
});

getById("copy-link-btn").addEventListener("click", () => {
  const url = window.location.href;
  const btn = getById("copy-link-btn");
  const doFallback = () => {
    const input = getById("share-url-input");
    input.select();
    input.setSelectionRange(0, 99999);
    try {
      const ok = document.execCommand("copy");
      if (!ok) showToast("⚠️ Copy failed — select and copy manually");
    } catch (_) {
      showToast("⚠️ Copy failed — select and copy manually");
    }
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      btn.textContent = "✓ Copied!";
      btn.classList.add("copied");
      showToast("📋 Link copied!");
      setTimeout(() => { btn.textContent = "📋 Copy"; btn.classList.remove("copied"); }, 2000);
    }).catch(() => {
      doFallback();
      showToast("📋 Link copied!");
    });
  } else {
    doFallback();
    showToast("📋 Link copied!");
  }
});

getById("print-share-qr-btn").addEventListener("click", () => {
  const url = window.location.href;
  QRCode.toCanvas(document.getElementById("print-qr-canvas"), url, {
    width: 320, margin: 2,
    color: { dark: "#1a3a5c", light: "#ffffff" },
  }, err => {
    if (err) { console.error("QR print generation failed:", err); return; }
    getById("print-url-text").textContent = url;
    getById("print-area").classList.remove("is-hidden");
    window.print();
    setTimeout(() => { getById("print-area").classList.add("is-hidden"); }, 500);
  });
});

// ─────────────────────────────────────────────────────
//  BARCODE SCANNER
// ─────────────────────────────────────────────────────
// Uses html5-qrcode to access the device camera.
// Matches scanned barcodes against product `barcode` field.
let html5Scanner = null;
let scannerRunning = false;

function openScannerModal() {
  getById("scanner-modal").classList.add("open");
  document.body.style.overflow = "hidden";
  setStatus("Starting camera…");
  startScanner();
}

function closeScannerModal() {
  stopScanner();
  getById("scanner-modal").classList.remove("open");
  document.body.style.overflow = "";
}

function setStatus(msg) {
  getById("scanner-status").textContent = msg;
}

function addScannedProductToCart(product) {
  const outOfStock = product.stock === 0;
  if (outOfStock) {
    setStatus("⚠️ " + product.name + " is out of stock.");
    return;
  }
  state.cart[product.id] = (state.cart[product.id] || 0) + 1;
  updateCartUI();
  showToast("✅ " + product.name + " added to cart");
  setStatus("✅ Added: " + product.name);
}

function onBarcodeDetected(decodedText) {
  // Normalize whitespace from scan result
  const scanned = decodedText.trim().toLowerCase();
  const match = state.barcodeMap.get(scanned);
  if (match) {
    addScannedProductToCart(match);
    // Brief pause so the user sees the result before the scanner continues
    if (html5Scanner) html5Scanner.pause();
    setTimeout(() => {
      if (html5Scanner && scannerRunning) {
        html5Scanner.resume();
        setStatus("Point camera at a barcode…");
      }
    }, 1500);
  } else {
    setStatus("⚠️ No product found for: " + decodedText.trim());
    setTimeout(() => {
      if (scannerRunning) setStatus("Point camera at a barcode…");
    }, 2000);
  }
}

function startScanner() {
  if (scannerRunning) return;

  if (!window.Html5Qrcode) {
    setStatus("⚠️ Scanner library not loaded. Check your connection.");
    return;
  }

  // Clear any previous scanner instance
  const viewport = getById("scanner-viewport");
  viewport.innerHTML = "";

  html5Scanner = new Html5Qrcode("scanner-viewport");
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 120 },
    aspectRatio: 1.7,
    // Support common retail barcode formats + QR
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.ITF,
    ],
  };

  html5Scanner.start(
    { facingMode: "environment" },
    config,
    onBarcodeDetected,
    () => { /* ignore per-frame decode errors */ }
  ).then(() => {
    scannerRunning = true;
    setStatus("Point camera at a barcode…");
  }).catch(err => {
    scannerRunning = false;
    if (err && err.toString().includes("NotAllowedError")) {
      setStatus("⚠️ Camera permission denied. Please allow camera access and try again.");
    } else {
      setStatus("⚠️ Could not start camera. " + (err ? err.toString() : ""));
    }
  });
}

function stopScanner() {
  scannerRunning = false;
  if (html5Scanner) {
    html5Scanner.stop().catch(() => {}).finally(() => {
      html5Scanner = null;
      const viewport = getById("scanner-viewport");
      if (viewport) viewport.innerHTML = "";
    });
  }
}

getById("scan-btn").addEventListener("click", openScannerModal);
getById("close-scanner").addEventListener("click", closeScannerModal);
getById("scanner-close-btn").addEventListener("click", closeScannerModal);
getById("scanner-modal").addEventListener("click", e => {
  if (e.target === getById("scanner-modal")) closeScannerModal();
});
