// script.js

// Configurazioni
const LINEN_PRICE_PER_PERSON = 20; // € a persona per la biancheria
const PET_FEE = 30; // costo fisso per animale domestico

const MONTH_NAMES_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre"
];

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

// Mappa valori della select HTML -> chiavi del JSON
const ACCOMMODATION_MAP = {
  "asfodelo": "Asfodelo",
  "corbezzolo": "Corbezzolo",
  "rosmarino": "Rosmarino",
  "acquamarina": "Acquamarina",
  "beachside-retreats": "Beachside",
  "villa-jolies": "Villa Jolies"
};

let prezziData = null;
let lastQuote = null; // per PDF e copia testo

document.addEventListener("DOMContentLoaded", () => {
  // Carica il file prezzi.json
  fetch("prezzi.json")
    .then(res => {
      if (!res.ok) {
        throw new Error("Impossibile caricare prezzi.json");
      }
      return res.json();
    })
    .then(data => {
      prezziData = data;
    })
    .catch(err => {
      console.error(err);
      alert("Errore nel caricamento dei prezzi. Controlla il file prezzi.json.");
    });

  const calcBtn = document.getElementById("calculate-btn");
  const downloadBtn = document.getElementById("download-btn");
  const copyBtn = document.getElementById("copy-btn");
  const checkinInput = document.getElementById("checkin-date");
  const checkoutInput = document.getElementById("checkout-date");

  calcBtn.addEventListener("click", handleCalculate);
  downloadBtn.addEventListener("click", handleDownloadPdf);
  copyBtn.addEventListener("click", handleCopyQuote);

  // Vincolo: checkout deve essere successivo al check-in
  checkinInput.addEventListener("change", () => {
    const checkinStr = checkinInput.value;
    if (!checkinStr) return;

    const checkinDate = parseDateInput(checkinStr);
    if (!(checkinDate instanceof Date) || isNaN(checkinDate.getTime())) return;

    // min checkout = giorno successivo al check-in
    const minCheckout = new Date(
      checkinDate.getFullYear(),
      checkinDate.getMonth(),
      checkinDate.getDate() + 1
    );

    const yyyy = minCheckout.getFullYear();
    const mm = String(minCheckout.getMonth() + 1).padStart(2, "0");
    const dd = String(minCheckout.getDate()).padStart(2, "0");
    const minStr = `${yyyy}-${mm}-${dd}`;

    checkoutInput.min = minStr;

    // Se il checkout corrente è prima del minimo, lo resetto
    if (checkoutInput.value && checkoutInput.value < minStr) {
      checkoutInput.value = "";
    }
  });
});

function handleCalculate() {
  if (!prezziData) {
    alert("I dati dei prezzi non sono ancora stati caricati. Riprova tra un momento.");
    return;
  }

  // Recupera i valori dal form
  const guestName = document.getElementById("client-name").value.trim();
  const accommodationValue = document.getElementById("accommodation").value;
  const checkinStr = document.getElementById("checkin-date").value;
  const checkoutStr = document.getElementById("checkout-date").value;
  const guests = parseInt(document.getElementById("guests").value || "0", 10);
  const discountPercent = parseFloat(document.getElementById("discount").value || "0");
  const discountEuroInput = parseFloat(document.getElementById("discount-euro").value || "0");
  const linenIncluded = document.getElementById("linen-included").checked;
  const hasPet = document.getElementById("pet").checked;

  if (!accommodationValue) {
    alert("Seleziona un alloggio.");
    return;
  }
  if (!checkinStr || !checkoutStr) {
    alert("Inserisci le date di check-in e check-out.");
    return;
  }

  const checkinDate = parseDateInput(checkinStr);
  const checkoutDate = parseDateInput(checkoutStr);

  if (!(checkinDate instanceof Date) || isNaN(checkinDate.getTime()) ||
      !(checkoutDate instanceof Date) || isNaN(checkoutDate.getTime())) {
    alert("Date non valide.");
    return;
  }

  if (checkoutDate <= checkinDate) {
    alert("The check-out date must be after the check-in date.");
    return;
  }

  if (guests <= 0) {
    alert("Inserisci un numero di ospiti valido.");
    return;
  }

  const accKey = ACCOMMODATION_MAP[accommodationValue];
  const accData = prezziData[accKey];

  if (!accData) {
    alert("Alloggio non trovato nei dati dei prezzi.");
    return;
  }

  // Calcolo numero notti e totale affitto (base, prima dello sconto %)
  const { nights, rentTotal, perMonthNights } = calculateRent(checkinDate, checkoutDate, accData);

  // Calcolo costi extra
  const cleaningCost = accData.pulizia || 0;
  const linenCost = linenIncluded ? guests * LINEN_PRICE_PER_PERSON : 0;
  const petCost = hasPet ? PET_FEE : 0;

  // Sconto in percentuale SOLO sull'affitto
  const validDiscountPercent = Math.min(Math.max(discountPercent, 0), 100); // clamp 0-100
  const percentDiscountAmount = rentTotal * (validDiscountPercent / 100);
  const rentAfterPercent = rentTotal - percentDiscountAmount;

  // Subtotale dopo sconto % e dopo aver aggiunto le spese
  const subtotalBeforeEuro = rentAfterPercent + cleaningCost + linenCost + petCost;

  // Sconto fisso in euro (non negativo) sul subtotal
  const discountEuro = Math.max(discountEuroInput, 0);

  let total = subtotalBeforeEuro - discountEuro;
  if (total < 0) total = 0;

  // Salva l'ultimo preventivo per PDF e copia testo
  lastQuote = {
    guestName,
    accommodation: accKey,
    checkinDate,
    checkoutDate,
    guests,
    nights,
    rentTotal,            // affitto pieno
    rentAfterPercent,     // affitto dopo sconto %
    perMonthNights,
    cleaningCost,
    linenCost,
    petCost,
    subtotalBeforeEuro,
    discountPercent: validDiscountPercent,
    percentDiscountAmount,
    discountEuro,
    total
  };

  renderQuoteResult(lastQuote);

  const downloadBtn = document.getElementById("download-btn");
  const copyBtn = document.getElementById("copy-btn");
  downloadBtn.disabled = false;
  copyBtn.disabled = false;
}

// Parse delle date nel formato yyyy-mm-dd come date locali
function parseDateInput(value) {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  return new Date(year, month - 1, day);
}

// Calcola notti e affitto, considerando il cambio mese
function calculateRent(checkin, checkout, accData) {
  let nights = 0;
  let rentTotal = 0;
  const perMonthNights = {}; // es: { "luglio": 5, "agosto": 3 }

  // clone per iterare giorno per giorno
  const current = new Date(checkin.getFullYear(), checkin.getMonth(), checkin.getDate());

  while (current < checkout) {
    nights++;
    const monthName = MONTH_NAMES_IT[current.getMonth()];
    const monthPrices = accData.prezzi || {};
    const nightlyRate = monthPrices[monthName];

    if (typeof nightlyRate === "number") {
      rentTotal += nightlyRate;
    } else {
      console.warn(`Prezzo non trovato per mese ${monthName}, uso 0`);
    }

    perMonthNights[monthName] = (perMonthNights[monthName] || 0) + 1;

    // prossimo giorno
    current.setDate(current.getDate() + 1);
  }

  return { nights, rentTotal, perMonthNights };
}

function getEnglishMonth(itMonth) {
  const idx = MONTH_NAMES_IT.indexOf(itMonth);
  if (idx === -1) return itMonth;
  return MONTH_NAMES_EN[idx];
}

// Mostra il risultato nella pagina (in inglese) con tabelle allineate
function renderQuoteResult(quote) {
  const container = document.getElementById("quote-result");
  if (!container) return;

  const fmtDate = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const fmtMoney = (v) => v.toFixed(2); // stile inglese: 1234.50

  const {
    guestName,
    accommodation,
    checkinDate,
    checkoutDate,
    guests,
    nights,
    rentTotal,
    rentAfterPercent,
    perMonthNights,
    cleaningCost,
    linenCost,
    petCost,
    subtotalBeforeEuro,
    discountPercent,
    percentDiscountAmount,
    discountEuro,
    total
  } = quote;

  // Tabella notti per mese
  const monthsRows = Object.entries(perMonthNights)
    .map(([monthIt, n]) => {
      const monthEn = getEnglishMonth(monthIt);
      return `<tr><td class="label">${monthEn}</td><td class="value">${n} nights</td></tr>`;
    })
    .join("");

  const monthsTable = monthsRows
    ? `<table class="quote-table"><tbody>${monthsRows}</tbody></table>`
    : "<div class='quote-line'><span>-</span></div>";

  // Tabella costi
  let costRows = "";
  // Affitto e sconto %
  costRows += `<tr><td class="label">Rental (full price)</td><td class="value">${fmtMoney(rentTotal)} €</td></tr>`;
  if (percentDiscountAmount > 0.0001) {
    costRows += `<tr><td class="label">Discount on rental (${discountPercent.toFixed(1)}%)</td><td class="value">−${fmtMoney(percentDiscountAmount)} €</td></tr>`;
    costRows += `<tr><td class="label">Rental after discount</td><td class="value">${fmtMoney(rentAfterPercent)} €</td></tr>`;
  }

  // Spese extra
  costRows += `<tr><td class="label">Cleaning fee</td><td class="value">${fmtMoney(cleaningCost)} €</td></tr>`;
  costRows += `<tr><td class="label">Linen${linenCost > 0 ? "" : " (not included)"}</td><td class="value">${fmtMoney(linenCost)} €</td></tr>`;
  if (petCost > 0) {
    costRows += `<tr><td class="label">Pet fee</td><td class="value">${fmtMoney(petCost)} €</td></tr>`;
  }

  // Subtotale dopo sconto % e spese
  costRows += `<tr><td class="label">Subtotal</td><td class="value">${fmtMoney(subtotalBeforeEuro)} €</td></tr>`;

  // Sconto in euro (aggiuntivo)
  if (discountEuro > 0.0001) {
    costRows += `<tr><td class="label">Additional discount</td><td class="value">−${fmtMoney(discountEuro)} €</td></tr>`;
  }

  // Totale
  costRows += `<tr class="total-row"><td class="label">TOTAL QUOTE</td><td class="value">${fmtMoney(total)} €</td></tr>`;

  const costTable = `<table class="quote-table"><tbody>${costRows}</tbody></table>`;

  container.innerHTML = `
    <h3>Quote summary</h3>
    <div class="quote-section">
      <div class="quote-line">
        <span>Guest</span>
        <span>${guestName || "-"}</span>
      </div>
      <div class="quote-line">
        <span>Property</span>
        <span>${accommodation}</span>
      </div>
      <div class="quote-line">
        <span>Stay</span>
        <span>${fmtDate(checkinDate)} → ${fmtDate(checkoutDate)} (${nights} nights)</span>
      </div>
      <div class="quote-line">
        <span>Guests</span>
        <span>${guests}</span>
      </div>
      <div class="quote-line">
        <span>Check-in / Check-out time</span>
        <span>Check-in after 4:00 PM · Check-out by 10:00 AM</span>
      </div>
    </div>

    <div class="quote-section">
      <strong>Nights per month</strong>
      ${monthsTable}
    </div>

    <div class="quote-section quote-section-box">
      ${costTable}
    </div>
  `;
}

// Genera e scarica il PDF del preventivo (in inglese) con logo e sito
function handleDownloadPdf() {
  if (!lastQuote) {
    alert("Calcola prima un preventivo.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Libreria jsPDF non disponibile. Controlla il tag script in index.html.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const q = lastQuote;
  const fmtDate = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const fmtMoney = (v) => v.toFixed(2);

  let y = 15;

  // Se vuoi puoi sostituire con un dataURL base64 del tuo logo
  const logoUrl = "https://static.wixstatic.com/media/b735a36e0f6c42a791260055e50d799b.png/v1/fill/w_110,h_110,al_c,q_85,enc_auto/b735a36e0f6c42a791260055e50d799b.png";

  const drawPdf = (logoImg) => {
    // Logo (se caricato)
    if (logoImg) {
      try {
        doc.addImage(logoImg, "PNG", 10, 8, 20, 20); // x, y, width, height
      } catch (e) {
        console.warn("Impossibile aggiungere il logo al PDF:", e);
      }
    }

    // Header testo
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Sardinian Seaside Retreats", 35, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Booking quote", 35, 24);
    doc.setFontSize(10);
    doc.text("www.sardinianseasideretreats.com", 35, 29);

    y = 40;
    const lineLeft = 10;
    const line = (text, offsetY = 7, x = lineLeft) => {
      doc.text(text, x, y);
      y += offsetY;
    };

    // Guest & stay info
    doc.setFontSize(11);
    line(`Guest: ${q.guestName || "-"}`);
    line(`Property: ${q.accommodation}`);
    line(`Stay: ${fmtDate(q.checkinDate)} to ${fmtDate(q.checkoutDate)} (${q.nights} nights)`);
    line(`Guests: ${q.guests}`);
    line(`Check-in after 4:00 PM · Check-out by 10:00 AM`);
    y += 4;

    // Nights per month
    doc.setFont("helvetica", "bold");
    line("Nights per month:");
    doc.setFont("helvetica", "normal");

    Object.entries(q.perMonthNights).forEach(([monthIt, n]) => {
      const monthEn = getEnglishMonth(monthIt);
      line(`- ${monthEn}: ${n} nights`, 6, lineLeft + 4);
    });

    y += 4;

    // Totali (colonna allineata a destra usando align:'right')
    const rightX = 200;

    const lineRight = (label, value, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(label, lineLeft, y);
      doc.text(value, rightX, y, { align: "right" });
      y += 6;
    };

    doc.setFont("helvetica", "normal");
    lineRight(`Rental (full price)`, `${fmtMoney(q.rentTotal)} €`);
    if (q.percentDiscountAmount > 0.0001) {
      lineRight(`Discount on rental (${q.discountPercent.toFixed(1)}%)`, `-${fmtMoney(q.percentDiscountAmount)} €`);
      lineRight(`Rental after discount`, `${fmtMoney(q.rentAfterPercent)} €`);
    }
    lineRight(`Cleaning fee`, `${fmtMoney(q.cleaningCost)} €`);
    lineRight(`Linen`, `${fmtMoney(q.linenCost)} €`);
    if (q.petCost > 0) {
      lineRight(`Pet fee`, `${fmtMoney(q.petCost)} €`);
    }

    lineRight(`Subtotal`, `${fmtMoney(q.subtotalBeforeEuro)} €`);
    if (q.discountEuro > 0.0001) {
      lineRight(`Additional discount`, `-${fmtMoney(q.discountEuro)} €`);
    }
    lineRight(`TOTAL`, `${fmtMoney(q.total)} €`, true);

    const safeGuestName = (q.guestName || "guest").replace(/\s+/g, "_");
    doc.save(`quote_${safeGuestName}.pdf`);
  };

  // Carichiamo il logo in modo "best effort"
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = function () {
    // Creiamo una canvas per ottenere un dataURL
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    drawPdf(dataUrl);
  };
  img.onerror = function () {
    console.warn("Logo non caricato, creo il PDF senza logo.");
    drawPdf(null);
  };
  img.src = logoUrl;
}

// Copia il preventivo come testo per WhatsApp / email
async function handleCopyQuote() {
  if (!lastQuote) {
    alert("Calcola prima un preventivo.");
    return;
  }

  const q = lastQuote;
  const fmtDate = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const fmtMoney = (v) => v.toFixed(2);

  let text = "";
  text += "Sardinian Seaside Retreats - Booking quote\n";
  text += "www.sardinianseasideretreats.com\n\n";
  text += `Guest: ${q.guestName || "-"}\n`;
  text += `Property: ${q.accommodation}\n`;
  text += `Stay: ${fmtDate(q.checkinDate)} to ${fmtDate(q.checkoutDate)} (${q.nights} nights)\n`;
  text += `Guests: ${q.guests}\n`;
  text += `Check-in after 4:00 PM · Check-out by 10:00 AM\n\n`;

  text += "Nights per month:\n";
  Object.entries(q.perMonthNights).forEach(([monthIt, n]) => {
    const monthEn = getEnglishMonth(monthIt);
    text += `- ${monthEn}: ${n} nights\n`;
  });

  text += "\n";
  text += `Rental (full price): ${fmtMoney(q.rentTotal)} €\n`;
  if (q.percentDiscountAmount > 0.0001) {
    text += `Discount on rental (${q.discountPercent.toFixed(1)}%): -${fmtMoney(q.percentDiscountAmount)} €\n`;
    text += `Rental after discount: ${fmtMoney(q.rentAfterPercent)} €\n`;
  }
  text += `Cleaning fee: ${fmtMoney(q.cleaningCost)} €\n`;
  text += `Linen: ${fmtMoney(q.linenCost)} €\n`;
  if (q.petCost > 0) {
    text += `Pet fee: ${fmtMoney(q.petCost)} €\n`;
  }
  text += `Subtotal: ${fmtMoney(q.subtotalBeforeEuro)} €\n`;
  if (q.discountEuro > 0.0001) {
    text += `Additional discount: -${fmtMoney(q.discountEuro)} €\n`;
  }
  text += `TOTAL: ${fmtMoney(q.total)} €\n`;

  try {
    await navigator.clipboard.writeText(text);
    alert("Preventivo copiato negli appunti. Ora puoi incollarlo in WhatsApp o in una email.");
  } catch (err) {
    console.error(err);
    alert("Impossibile copiare negli appunti su questo dispositivo. Copia manualmente dal riepilogo.");
  }
}
