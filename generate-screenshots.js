const sharp = require('sharp');

function card(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#ffffff" filter="url(#shadow)"/>`;
}

function phoneFrame(content) {
  return `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1920" fill="#f5f5f7"/>
    <defs><filter id="shadow" x="-2%" y="-2%" width="104%" height="108%"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-opacity="0.06"/></filter></defs>
    <rect width="1080" height="44" fill="#ffffff"/>
    <text x="540" y="30" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle">9:41</text>
    <rect y="44" width="1080" height="60" fill="#ffffff"/>
    <rect x="0" y="103" width="1080" height="1" fill="#e8eaed"/>
    ${content}
    <rect y="1836" width="1080" height="84" fill="#ffffff"/>
    <rect x="0" y="1836" width="1080" height="1" fill="#e8eaed"/>
    <circle cx="162" cy="1868" r="12" fill="none" stroke="#7c3aed" stroke-width="2"/>
    <text x="162" y="1896" font-family="Inter,Arial,sans-serif" font-size="10" fill="#7c3aed" text-anchor="middle" font-weight="600">Accueil</text>
    <circle cx="378" cy="1868" r="12" fill="none" stroke="#94a3b8" stroke-width="2"/>
    <text x="378" y="1896" font-family="Inter,Arial,sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Entrees</text>
    <circle cx="540" cy="1858" r="26" fill="#7c3aed"/>
    <text x="540" y="1865" font-family="Inter,Arial,sans-serif" font-size="26" fill="white" text-anchor="middle">+</text>
    <circle cx="702" cy="1868" r="12" fill="none" stroke="#94a3b8" stroke-width="2"/>
    <text x="702" y="1896" font-family="Inter,Arial,sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Sorties</text>
    <circle cx="918" cy="1868" r="12" fill="none" stroke="#94a3b8" stroke-width="2"/>
    <text x="918" y="1896" font-family="Inter,Arial,sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Plus</text>
  </svg>`;
}

function tabletFrame(content) {
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#f5f5f7"/>
    <defs><filter id="shadow" x="-2%" y="-2%" width="104%" height="108%"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-opacity="0.06"/></filter></defs>
    <rect width="1920" height="44" fill="#ffffff"/>
    <text x="960" y="30" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle">9:41</text>
    <rect y="44" width="1920" height="56" fill="#ffffff"/>
    <rect x="0" y="99" width="1920" height="1" fill="#e8eaed"/>
    ${content}
  </svg>`;
}

async function main() {
  // ==================== PHONE SCREENSHOTS ====================

  // 01 Dashboard
  await sharp(Buffer.from(phoneFrame(`
    <text x="40" y="82" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#0f172a">Tableau de bord</text>
    <text x="1040" y="82" font-family="Inter,Arial,sans-serif" font-size="20" fill="#0f172a" text-anchor="end">&#x1F514;</text>
    ${card(30, 120, 500, 140)}
    <text x="60" y="160" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" font-weight="500">Chiffre d'affaires</text>
    <text x="60" y="205" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="#0f172a">245,800 MAD</text>
    <rect x="60" y="218" width="56" height="20" rx="10" fill="#dcfce7"/>
    <text x="88" y="232" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">+12%</text>
    ${card(550, 120, 500, 140)}
    <text x="580" y="160" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" font-weight="500">Depenses</text>
    <text x="580" y="205" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="#0f172a">89,350 MAD</text>
    <rect x="580" y="218" width="50" height="20" rx="10" fill="#fee2e2"/>
    <text x="605" y="232" font-family="Inter,Arial,sans-serif" font-size="11" fill="#dc2626" text-anchor="middle" font-weight="600">-5%</text>
    ${card(30, 280, 1020, 120)}
    <text x="60" y="320" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" font-weight="500">Solde bancaire</text>
    <text x="60" y="365" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="800" fill="#7c3aed">156,450 MAD</text>
    <text x="40" y="450" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Actions rapides</text>
    ${card(30, 470, 240, 90)} <text x="150" y="510" font-family="Inter,Arial,sans-serif" font-size="22" text-anchor="middle">&#x1F4F8;</text> <text x="150" y="540" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b" text-anchor="middle" font-weight="500">Scanner</text>
    ${card(290, 470, 240, 90)} <text x="410" y="510" font-family="Inter,Arial,sans-serif" font-size="22" text-anchor="middle">&#x1F4C4;</text> <text x="410" y="540" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b" text-anchor="middle" font-weight="500">Facture</text>
    ${card(550, 470, 240, 90)} <text x="670" y="510" font-family="Inter,Arial,sans-serif" font-size="22" text-anchor="middle">&#x1F3E6;</text> <text x="670" y="540" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b" text-anchor="middle" font-weight="500">Banque</text>
    ${card(810, 470, 240, 90)} <text x="930" y="510" font-family="Inter,Arial,sans-serif" font-size="22" text-anchor="middle">&#x1F465;</text> <text x="930" y="540" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b" text-anchor="middle" font-weight="500">Salaries</text>
    <text x="40" y="620" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Activite recente</text>
    ${card(30, 640, 1020, 76)}
    <circle cx="78" cy="678" r="20" fill="#ede9fe"/>
    <text x="110" y="670" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Facture #2026-087</text>
    <text x="110" y="692" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Atlas Corp</text>
    <text x="1000" y="680" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#16a34a" text-anchor="end">+15,000</text>
    ${card(30, 730, 1020, 76)}
    <circle cx="78" cy="768" r="20" fill="#fef3c7"/>
    <text x="110" y="760" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Recu Marjane</text>
    <text x="110" y="782" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Fournitures bureau</text>
    <text x="1000" y="770" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#dc2626" text-anchor="end">-2,340</text>
    ${card(30, 820, 1020, 76)}
    <circle cx="78" cy="858" r="20" fill="#dbeafe"/>
    <text x="110" y="850" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Virement CIH Bank</text>
    <text x="110" y="872" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Compte principal</text>
    <text x="1000" y="860" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#16a34a" text-anchor="end">+45,000</text>
    ${card(30, 910, 1020, 76)}
    <circle cx="78" cy="948" r="20" fill="#d1fae5"/>
    <text x="110" y="940" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Bulletin Mars 2026</text>
    <text x="110" y="962" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Ahmed Benali</text>
    <text x="1000" y="950" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#dc2626" text-anchor="end">-8,500</text>
  `))).png().toFile('google-play-release/screenshots/01_dashboard.png');
  console.log('01_dashboard.png');

  // 02 Scanner
  await sharp(Buffer.from(phoneFrame(`
    <text x="40" y="82" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#0f172a">Scanner de recus</text>
    <rect x="30" y="120" width="1020" height="460" rx="20" fill="#1e293b"/>
    <circle cx="540" cy="350" r="55" fill="none" stroke="white" stroke-width="3" opacity="0.5"/>
    <text x="540" y="440" font-family="Inter,Arial,sans-serif" font-size="15" fill="white" text-anchor="middle" opacity="0.6">Placez votre recu dans le cadre</text>
    <rect x="140" y="230" width="800" height="200" rx="10" fill="none" stroke="white" stroke-width="2" stroke-dasharray="10,10" opacity="0.3"/>
    <text x="40" y="630" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Resultat de l'extraction</text>
    ${card(30, 650, 1020, 340)}
    <text x="60" y="695" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Fournisseur</text>
    <text x="1000" y="695" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">Marjane Holding</text>
    <line x1="60" y1="715" x2="1020" y2="715" stroke="#e8eaed"/>
    <text x="60" y="750" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Date</text>
    <text x="1000" y="750" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">12/03/2026</text>
    <line x1="60" y1="770" x2="1020" y2="770" stroke="#e8eaed"/>
    <text x="60" y="805" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Montant TTC</text>
    <text x="1000" y="805" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#7c3aed" text-anchor="end">2,340.00 MAD</text>
    <line x1="60" y1="825" x2="1020" y2="825" stroke="#e8eaed"/>
    <text x="60" y="860" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">TVA (20%)</text>
    <text x="1000" y="860" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">390.00 MAD</text>
    <line x1="60" y1="880" x2="1020" y2="880" stroke="#e8eaed"/>
    <text x="60" y="915" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Categorie</text>
    <rect x="860" y="898" width="160" height="26" rx="13" fill="#ede9fe"/>
    <text x="940" y="916" font-family="Inter,Arial,sans-serif" font-size="12" fill="#7c3aed" text-anchor="middle" font-weight="600">Fournitures</text>
    <line x1="60" y1="940" x2="1020" y2="940" stroke="#e8eaed"/>
    <text x="60" y="970" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Doublon</text>
    <text x="1000" y="970" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#16a34a" text-anchor="end">&#x2713; Non detecte</text>
    <rect x="30" y="1020" width="1020" height="56" rx="14" fill="#7c3aed"/>
    <text x="540" y="1055" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="white" text-anchor="middle">Enregistrer le recu</text>
  `))).png().toFile('google-play-release/screenshots/02_scanner.png');
  console.log('02_scanner.png');

  // 03 Bank
  await sharp(Buffer.from(phoneFrame(`
    <text x="40" y="82" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#0f172a">Banque</text>
    ${card(30, 120, 1020, 110)}
    <circle cx="80" cy="175" r="24" fill="#ede9fe"/>
    <text x="120" y="165" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">CIH Bank - Compte Pro</text>
    <text x="120" y="190" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">**** **** **** 4521</text>
    <text x="1000" y="178" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="800" fill="#7c3aed" text-anchor="end">156,450 MAD</text>
    <rect x="30" y="250" width="160" height="38" rx="19" fill="#7c3aed"/>
    <text x="110" y="274" font-family="Inter,Arial,sans-serif" font-size="13" fill="white" text-anchor="middle" font-weight="600">Toutes</text>
    <rect x="200" y="250" width="160" height="38" rx="19" fill="#fff" stroke="#e8eaed" stroke-width="1.5"/>
    <text x="280" y="274" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Entrees</text>
    <rect x="370" y="250" width="160" height="38" rx="19" fill="#fff" stroke="#e8eaed" stroke-width="1.5"/>
    <text x="450" y="274" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Sorties</text>
    <text x="40" y="325" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="600" fill="#64748b">Mars 2026</text>
    ${card(30, 340, 1020, 76)}
    <circle cx="76" cy="378" r="18" fill="#dcfce7"/><text x="76" y="383" font-family="Inter,Arial,sans-serif" font-size="13" text-anchor="middle" fill="#16a34a">&#x2193;</text>
    <text x="110" y="370" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Virement client Atlas Corp</text>
    <text x="110" y="392" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">12 Mars 2026</text>
    <text x="1000" y="380" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00</text>
    ${card(30, 430, 1020, 76)}
    <circle cx="76" cy="468" r="18" fill="#fee2e2"/><text x="76" y="473" font-family="Inter,Arial,sans-serif" font-size="13" text-anchor="middle" fill="#dc2626">&#x2191;</text>
    <text x="110" y="460" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Paiement fournisseur Marjane</text>
    <text x="110" y="482" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">11 Mars 2026</text>
    <text x="1000" y="470" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#dc2626" text-anchor="end">-12,500.00</text>
    ${card(30, 520, 1020, 76)}
    <circle cx="76" cy="558" r="18" fill="#dcfce7"/><text x="76" y="563" font-family="Inter,Arial,sans-serif" font-size="13" text-anchor="middle" fill="#16a34a">&#x2193;</text>
    <text x="110" y="550" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Encaissement cheque #1245</text>
    <text x="110" y="572" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">10 Mars 2026</text>
    <text x="1000" y="560" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#16a34a" text-anchor="end">+28,750.00</text>
    ${card(30, 610, 1020, 76)}
    <circle cx="76" cy="648" r="18" fill="#fee2e2"/><text x="76" y="653" font-family="Inter,Arial,sans-serif" font-size="13" text-anchor="middle" fill="#dc2626">&#x2191;</text>
    <text x="110" y="640" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Salaires Mars 2026</text>
    <text x="110" y="662" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">09 Mars 2026</text>
    <text x="1000" y="650" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#dc2626" text-anchor="end">-34,000.00</text>
    ${card(30, 700, 1020, 76)}
    <circle cx="76" cy="738" r="18" fill="#fee2e2"/><text x="76" y="743" font-family="Inter,Arial,sans-serif" font-size="13" text-anchor="middle" fill="#dc2626">&#x2191;</text>
    <text x="110" y="730" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Loyer bureau Abdelmoumen</text>
    <text x="110" y="752" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">08 Mars 2026</text>
    <text x="1000" y="740" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#dc2626" text-anchor="end">-8,000.00</text>
  `))).png().toFile('google-play-release/screenshots/03_banque.png');
  console.log('03_banque.png');

  // 04 Factures
  await sharp(Buffer.from(phoneFrame(`
    <text x="40" y="82" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#0f172a">Factures</text>
    <rect x="880" y="58" width="160" height="38" rx="12" fill="#7c3aed"/>
    <text x="960" y="82" font-family="Inter,Arial,sans-serif" font-size="13" fill="white" text-anchor="middle" font-weight="600">+ Nouvelle</text>
    ${card(30, 120, 330, 95)}
    <text x="55" y="152" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Total</text>
    <text x="55" y="185" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#0f172a">245,800</text>
    ${card(375, 120, 330, 95)}
    <text x="400" y="152" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Payees</text>
    <text x="400" y="185" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#16a34a">198,300</text>
    ${card(720, 120, 330, 95)}
    <text x="745" y="152" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">En attente</text>
    <text x="745" y="185" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#f59e0b">47,500</text>
    ${card(30, 235, 1020, 105)}
    <text x="60" y="268" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">FAC-2026-087</text>
    <rect x="240" y="253" width="65" height="22" rx="11" fill="#dcfce7"/><text x="272" y="268" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="60" y="295" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Atlas Corp - 12 Mars 2026</text>
    <text x="60" y="320" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed">15,000.00 MAD</text>
    ${card(30, 355, 1020, 105)}
    <text x="60" y="388" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">FAC-2026-086</text>
    <rect x="240" y="373" width="85" height="22" rx="11" fill="#fef3c7"/><text x="282" y="388" font-family="Inter,Arial,sans-serif" font-size="11" fill="#d97706" text-anchor="middle" font-weight="600">En attente</text>
    <text x="60" y="415" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Sahara Digital - 10 Mars 2026</text>
    <text x="60" y="440" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed">32,500.00 MAD</text>
    ${card(30, 475, 1020, 105)}
    <text x="60" y="508" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">FAC-2026-085</text>
    <rect x="240" y="493" width="65" height="22" rx="11" fill="#dcfce7"/><text x="272" y="508" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="60" y="535" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Maroc Telecom - 08 Mars 2026</text>
    <text x="60" y="560" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed">8,900.00 MAD</text>
    ${card(30, 595, 1020, 105)}
    <text x="60" y="628" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">FAC-2026-084</text>
    <rect x="240" y="613" width="65" height="22" rx="11" fill="#dcfce7"/><text x="272" y="628" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="60" y="655" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">OCP Group - 05 Mars 2026</text>
    <text x="60" y="680" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed">55,000.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/04_factures.png');
  console.log('04_factures.png');

  // 05 Salaries
  await sharp(Buffer.from(phoneFrame(`
    <text x="40" y="82" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#0f172a">Salaries</text>
    <rect x="880" y="58" width="160" height="38" rx="12" fill="#7c3aed"/>
    <text x="960" y="82" font-family="Inter,Arial,sans-serif" font-size="13" fill="white" text-anchor="middle" font-weight="600">+ Ajouter</text>
    ${card(30, 120, 1020, 95)}
    <circle cx="82" cy="167" r="26" fill="#ede9fe"/>
    <text x="82" y="174" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#7c3aed" text-anchor="middle">AB</text>
    <text x="125" y="157" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">Ahmed Benali</text>
    <text x="125" y="180" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Developpeur Senior</text>
    <text x="1000" y="162" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">12,000 MAD</text>
    <rect x="920" y="172" width="80" height="20" rx="10" fill="#dcfce7"/><text x="960" y="186" font-family="Inter,Arial,sans-serif" font-size="10" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(30, 230, 1020, 95)}
    <circle cx="82" cy="277" r="26" fill="#fef3c7"/>
    <text x="82" y="284" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#d97706" text-anchor="middle">SE</text>
    <text x="125" y="267" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">Sara El Amrani</text>
    <text x="125" y="290" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Comptable</text>
    <text x="1000" y="272" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">9,500 MAD</text>
    <rect x="920" y="282" width="80" height="20" rx="10" fill="#dcfce7"/><text x="960" y="296" font-family="Inter,Arial,sans-serif" font-size="10" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(30, 340, 1020, 95)}
    <circle cx="82" cy="387" r="26" fill="#dbeafe"/>
    <text x="82" y="394" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#2563eb" text-anchor="middle">KM</text>
    <text x="125" y="377" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">Karim Mansouri</text>
    <text x="125" y="400" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Commercial</text>
    <text x="1000" y="382" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">8,500 MAD</text>
    <rect x="920" y="392" width="80" height="20" rx="10" fill="#fef3c7"/><text x="960" y="406" font-family="Inter,Arial,sans-serif" font-size="10" fill="#d97706" text-anchor="middle" font-weight="600">Conge</text>
    ${card(30, 450, 1020, 95)}
    <circle cx="82" cy="497" r="26" fill="#d1fae5"/>
    <text x="82" y="504" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#059669" text-anchor="middle">FZ</text>
    <text x="125" y="487" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a">Fatima Zahra Idrissi</text>
    <text x="125" y="510" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b">Assistante RH</text>
    <text x="1000" y="492" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="end">7,000 MAD</text>
    <rect x="920" y="502" width="80" height="20" rx="10" fill="#dcfce7"/><text x="960" y="516" font-family="Inter,Arial,sans-serif" font-size="10" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    <text x="40" y="600" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Masse salariale</text>
    ${card(30, 620, 1020, 80)}
    <text x="60" y="660" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Total Mars 2026</text>
    <text x="1000" y="655" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800" fill="#7c3aed" text-anchor="end">37,000 MAD</text>
    <text x="1000" y="680" font-family="Inter,Arial,sans-serif" font-size="12" fill="#64748b" text-anchor="end">4 salaries actifs</text>
  `))).png().toFile('google-play-release/screenshots/05_salaries.png');
  console.log('05_salaries.png');

  // ==================== TABLET 7" SCREENSHOTS (1280x800) ====================

  // Tablet 01 Dashboard (1920x1080, 16:9)
  await sharp(Buffer.from(tabletFrame(`
    <text x="50" y="82" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#0f172a">Tableau de bord</text>
    ${card(40, 120, 590, 130)}
    <text x="70" y="160" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Chiffre d&#39;affaires</text>
    <text x="70" y="210" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="800" fill="#0f172a">245,800 MAD</text>
    <rect x="70" y="222" width="56" height="20" rx="10" fill="#dcfce7"/><text x="98" y="236" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">+12%</text>
    ${card(660, 120, 590, 130)}
    <text x="690" y="160" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Depenses</text>
    <text x="690" y="210" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="800" fill="#0f172a">89,350 MAD</text>
    <rect x="690" y="222" width="50" height="20" rx="10" fill="#fee2e2"/><text x="715" y="236" font-family="Inter,Arial,sans-serif" font-size="11" fill="#dc2626" text-anchor="middle" font-weight="600">-5%</text>
    ${card(1280, 120, 600, 130)}
    <text x="1310" y="160" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Solde bancaire</text>
    <text x="1310" y="210" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="800" fill="#7c3aed">156,450 MAD</text>
    <text x="50" y="290" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a">Activite recente</text>
    ${card(40, 310, 1840, 70)}
    <circle cx="85" cy="345" r="18" fill="#ede9fe"/>
    <text x="120" y="349" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Facture #2026-087</text>
    <text x="600" y="349" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Atlas Corp</text>
    <text x="1000" y="349" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">12 Mars 2026</text>
    <text x="1830" y="349" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#16a34a" text-anchor="end">+15,000.00 MAD</text>
    ${card(40, 390, 1840, 70)}
    <circle cx="85" cy="425" r="18" fill="#fef3c7"/>
    <text x="120" y="429" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Recu Marjane</text>
    <text x="600" y="429" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Fournitures bureau</text>
    <text x="1000" y="429" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">11 Mars 2026</text>
    <text x="1830" y="429" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#dc2626" text-anchor="end">-2,340.00 MAD</text>
    ${card(40, 470, 1840, 70)}
    <circle cx="85" cy="505" r="18" fill="#dbeafe"/>
    <text x="120" y="509" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Virement CIH Bank</text>
    <text x="600" y="509" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Compte principal</text>
    <text x="1000" y="509" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">10 Mars 2026</text>
    <text x="1830" y="509" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00 MAD</text>
    ${card(40, 550, 1840, 70)}
    <circle cx="85" cy="585" r="18" fill="#d1fae5"/>
    <text x="120" y="589" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Bulletin Mars 2026</text>
    <text x="600" y="589" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Ahmed Benali</text>
    <text x="1000" y="589" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">09 Mars 2026</text>
    <text x="1830" y="589" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#dc2626" text-anchor="end">-8,500.00 MAD</text>
    <text x="50" y="665" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a">Actions rapides</text>
    ${card(40, 685, 440, 100)} <text x="260" y="735" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" text-anchor="middle" font-weight="500">Scanner de recus</text>
    ${card(510, 685, 440, 100)} <text x="730" y="735" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" text-anchor="middle" font-weight="500">Nouvelle facture</text>
    ${card(980, 685, 440, 100)} <text x="1200" y="735" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" text-anchor="middle" font-weight="500">Import bancaire</text>
    ${card(1450, 685, 430, 100)} <text x="1665" y="735" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b" text-anchor="middle" font-weight="500">Gestion salaries</text>
  `))).png().toFile('google-play-release/screenshots/tablet7_01_dashboard.png');
  console.log('tablet7_01_dashboard.png');

  // Tablet 02 Bank (1920x1080, 16:9)
  await sharp(Buffer.from(tabletFrame(`
    <text x="50" y="82" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#0f172a">Banque</text>
    ${card(40, 120, 1840, 110)}
    <circle cx="100" cy="175" r="28" fill="#ede9fe"/>
    <text x="145" y="165" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a">CIH Bank - Compte Professionnel</text>
    <text x="145" y="192" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">**** **** **** 4521</text>
    <text x="1830" y="180" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="800" fill="#7c3aed" text-anchor="end">156,450.00 MAD</text>
    <rect x="40" y="250" width="170" height="40" rx="20" fill="#7c3aed"/><text x="125" y="276" font-family="Inter,Arial,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">Toutes</text>
    <rect x="220" y="250" width="170" height="40" rx="20" fill="#fff" stroke="#e8eaed" stroke-width="1.5"/><text x="305" y="276" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Entrees</text>
    <rect x="400" y="250" width="170" height="40" rx="20" fill="#fff" stroke="#e8eaed" stroke-width="1.5"/><text x="485" y="276" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Sorties</text>
    <text x="50" y="330" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#64748b">Mars 2026</text>
    ${card(40, 350, 1840, 70)}
    <circle cx="85" cy="385" r="18" fill="#dcfce7"/>
    <text x="120" y="389" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Virement client Atlas Corp</text>
    <text x="800" y="389" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">12 Mars 2026</text>
    <text x="1830" y="389" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00 MAD</text>
    ${card(40, 430, 1840, 70)}
    <circle cx="85" cy="465" r="18" fill="#fee2e2"/>
    <text x="120" y="469" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Paiement fournisseur Marjane</text>
    <text x="800" y="469" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">11 Mars 2026</text>
    <text x="1830" y="469" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#dc2626" text-anchor="end">-12,500.00 MAD</text>
    ${card(40, 510, 1840, 70)}
    <circle cx="85" cy="545" r="18" fill="#dcfce7"/>
    <text x="120" y="549" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Encaissement cheque #1245</text>
    <text x="800" y="549" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">10 Mars 2026</text>
    <text x="1830" y="549" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#16a34a" text-anchor="end">+28,750.00 MAD</text>
    ${card(40, 590, 1840, 70)}
    <circle cx="85" cy="625" r="18" fill="#fee2e2"/>
    <text x="120" y="629" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Salaires Mars 2026</text>
    <text x="800" y="629" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">09 Mars 2026</text>
    <text x="1830" y="629" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#dc2626" text-anchor="end">-34,000.00 MAD</text>
    ${card(40, 670, 1840, 70)}
    <circle cx="85" cy="705" r="18" fill="#fee2e2"/>
    <text x="120" y="709" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#0f172a">Loyer bureau Abdelmoumen</text>
    <text x="800" y="709" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">08 Mars 2026</text>
    <text x="1830" y="709" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#dc2626" text-anchor="end">-8,000.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/tablet7_02_banque.png');
  console.log('tablet7_02_banque.png');

  // Tablet 03 Factures (1920x1080, 16:9)
  await sharp(Buffer.from(tabletFrame(`
    <text x="50" y="82" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#0f172a">Factures</text>
    <rect x="1700" y="56" width="170" height="40" rx="14" fill="#7c3aed"/><text x="1785" y="82" font-family="Inter,Arial,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">+ Nouvelle</text>
    ${card(40, 120, 590, 110)}
    <text x="70" y="155" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Total facture</text>
    <text x="70" y="195" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="#0f172a">245,800 MAD</text>
    ${card(660, 120, 590, 110)}
    <text x="690" y="155" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Payees</text>
    <text x="690" y="195" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="#16a34a">198,300 MAD</text>
    ${card(1280, 120, 600, 110)}
    <text x="1310" y="155" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">En attente</text>
    <text x="1310" y="195" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="800" fill="#f59e0b">47,500 MAD</text>
    ${card(40, 255, 1840, 80)}
    <text x="70" y="300" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">FAC-2026-087</text>
    <rect x="240" y="285" width="65" height="22" rx="11" fill="#dcfce7"/><text x="272" y="300" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="700" y="300" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Atlas Corp</text>
    <text x="1100" y="300" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">12 Mars 2026</text>
    <text x="1830" y="300" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed" text-anchor="end">15,000.00 MAD</text>
    ${card(40, 345, 1840, 80)}
    <text x="70" y="390" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">FAC-2026-086</text>
    <rect x="240" y="375" width="85" height="22" rx="11" fill="#fef3c7"/><text x="282" y="390" font-family="Inter,Arial,sans-serif" font-size="11" fill="#d97706" text-anchor="middle" font-weight="600">En attente</text>
    <text x="700" y="390" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Sahara Digital</text>
    <text x="1100" y="390" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">10 Mars 2026</text>
    <text x="1830" y="390" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed" text-anchor="end">32,500.00 MAD</text>
    ${card(40, 435, 1840, 80)}
    <text x="70" y="480" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">FAC-2026-085</text>
    <rect x="240" y="465" width="65" height="22" rx="11" fill="#dcfce7"/><text x="272" y="480" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="700" y="480" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Maroc Telecom</text>
    <text x="1100" y="480" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">08 Mars 2026</text>
    <text x="1830" y="480" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed" text-anchor="end">8,900.00 MAD</text>
    ${card(40, 525, 1840, 80)}
    <text x="70" y="570" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">FAC-2026-084</text>
    <rect x="240" y="555" width="65" height="22" rx="11" fill="#dcfce7"/><text x="272" y="570" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="700" y="570" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">OCP Group</text>
    <text x="1100" y="570" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">05 Mars 2026</text>
    <text x="1830" y="570" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#7c3aed" text-anchor="end">55,000.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/tablet7_03_factures.png');
  console.log('tablet7_03_factures.png');

  // Tablet 04 Salaries (1920x1080, 16:9)
  await sharp(Buffer.from(tabletFrame(`
    <text x="50" y="82" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#0f172a">Salaries</text>
    <rect x="1700" y="56" width="170" height="40" rx="14" fill="#7c3aed"/><text x="1785" y="82" font-family="Inter,Arial,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">+ Ajouter</text>
    ${card(40, 120, 1840, 80)}
    <circle cx="90" cy="160" r="24" fill="#ede9fe"/><text x="90" y="167" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#7c3aed" text-anchor="middle">AB</text>
    <text x="130" y="152" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Ahmed Benali</text>
    <text x="130" y="175" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Developpeur Senior</text>
    <text x="1400" y="165" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a" text-anchor="end">12,000.00 MAD</text>
    <rect x="1750" y="150" width="80" height="22" rx="11" fill="#dcfce7"/><text x="1790" y="165" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(40, 210, 1840, 80)}
    <circle cx="90" cy="250" r="24" fill="#fef3c7"/><text x="90" y="257" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#d97706" text-anchor="middle">SE</text>
    <text x="130" y="242" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Sara El Amrani</text>
    <text x="130" y="265" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Comptable</text>
    <text x="1400" y="255" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a" text-anchor="end">9,500.00 MAD</text>
    <rect x="1750" y="240" width="80" height="22" rx="11" fill="#dcfce7"/><text x="1790" y="255" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(40, 300, 1840, 80)}
    <circle cx="90" cy="340" r="24" fill="#dbeafe"/><text x="90" y="347" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#2563eb" text-anchor="middle">KM</text>
    <text x="130" y="332" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Karim Mansouri</text>
    <text x="130" y="355" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Commercial</text>
    <text x="1400" y="345" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a" text-anchor="end">8,500.00 MAD</text>
    <rect x="1750" y="330" width="80" height="22" rx="11" fill="#fef3c7"/><text x="1790" y="345" font-family="Inter,Arial,sans-serif" font-size="11" fill="#d97706" text-anchor="middle" font-weight="600">Conge</text>
    ${card(40, 390, 1840, 80)}
    <circle cx="90" cy="430" r="24" fill="#d1fae5"/><text x="90" y="437" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#059669" text-anchor="middle">FZ</text>
    <text x="130" y="422" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Fatima Zahra Idrissi</text>
    <text x="130" y="445" font-family="Inter,Arial,sans-serif" font-size="13" fill="#64748b">Assistante RH</text>
    <text x="1400" y="435" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a" text-anchor="end">7,000.00 MAD</text>
    <rect x="1750" y="420" width="80" height="22" rx="11" fill="#dcfce7"/><text x="1790" y="435" font-family="Inter,Arial,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    <text x="50" y="520" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#0f172a">Masse salariale</text>
    ${card(40, 540, 1840, 80)}
    <text x="70" y="585" font-family="Inter,Arial,sans-serif" font-size="14" fill="#64748b">Total Mars 2026 - 4 salaries actifs</text>
    <text x="1830" y="585" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="800" fill="#7c3aed" text-anchor="end">37,000.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/tablet7_04_salaries.png');
  console.log('tablet7_04_salaries.png');

  console.log('\nAll done!');
}

main().catch(console.error);
