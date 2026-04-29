const sharp = require('sharp');

function card(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#ffffff" filter="url(#shadow)"/>`;
}

function chromebookFrame(content) {
  return `<svg width="2560" height="1440" xmlns="http://www.w3.org/2000/svg">
    <rect width="2560" height="1440" fill="#f5f5f7"/>
    <defs><filter id="shadow" x="-2%" y="-2%" width="104%" height="108%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.06"/></filter></defs>
    <rect width="2560" height="56" fill="#ffffff"/>
    <text x="1280" y="38" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="600" fill="#0f172a" text-anchor="middle">9:41</text>
    <rect y="56" width="2560" height="72" fill="#ffffff"/>
    <rect x="0" y="127" width="2560" height="1" fill="#e8eaed"/>
    ${content}
  </svg>`;
}

async function main() {
  // 01 Dashboard
  await sharp(Buffer.from(chromebookFrame(`
    <text x="70" y="105" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#0f172a">Tableau de bord</text>
    ${card(50, 155, 790, 170)}
    <text x="90" y="205" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Chiffre d&#39;affaires</text>
    <text x="90" y="270" font-family="Inter,Arial,sans-serif" font-size="44" font-weight="800" fill="#0f172a">245,800 MAD</text>
    <rect x="90" y="285" width="70" height="26" rx="13" fill="#dcfce7"/><text x="125" y="303" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">+12%</text>
    ${card(880, 155, 790, 170)}
    <text x="920" y="205" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Depenses</text>
    <text x="920" y="270" font-family="Inter,Arial,sans-serif" font-size="44" font-weight="800" fill="#0f172a">89,350 MAD</text>
    <rect x="920" y="285" width="60" height="26" rx="13" fill="#fee2e2"/><text x="950" y="303" font-family="Inter,Arial,sans-serif" font-size="14" fill="#dc2626" text-anchor="middle" font-weight="600">-5%</text>
    ${card(1710, 155, 800, 170)}
    <text x="1750" y="205" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Solde bancaire</text>
    <text x="1750" y="270" font-family="Inter,Arial,sans-serif" font-size="44" font-weight="800" fill="#7c3aed">156,450 MAD</text>
    <text x="70" y="380" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a">Activite recente</text>
    ${card(50, 400, 2460, 90)}
    <circle cx="110" cy="445" r="24" fill="#ede9fe"/>
    <text x="155" y="440" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Facture #2026-087</text>
    <text x="750" y="440" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Atlas Corp</text>
    <text x="1300" y="440" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">12 Mars 2026</text>
    <text x="2450" y="450" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#16a34a" text-anchor="end">+15,000.00 MAD</text>
    ${card(50, 500, 2460, 90)}
    <circle cx="110" cy="545" r="24" fill="#fef3c7"/>
    <text x="155" y="540" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Recu Marjane</text>
    <text x="750" y="540" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Fournitures bureau</text>
    <text x="1300" y="540" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">11 Mars 2026</text>
    <text x="2450" y="550" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#dc2626" text-anchor="end">-2,340.00 MAD</text>
    ${card(50, 600, 2460, 90)}
    <circle cx="110" cy="645" r="24" fill="#dbeafe"/>
    <text x="155" y="640" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Virement CIH Bank</text>
    <text x="750" y="640" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Compte principal</text>
    <text x="1300" y="640" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">10 Mars 2026</text>
    <text x="2450" y="650" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00 MAD</text>
    ${card(50, 700, 2460, 90)}
    <circle cx="110" cy="745" r="24" fill="#d1fae5"/>
    <text x="155" y="740" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Bulletin Mars 2026</text>
    <text x="750" y="740" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Ahmed Benali</text>
    <text x="1300" y="740" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">09 Mars 2026</text>
    <text x="2450" y="750" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#dc2626" text-anchor="end">-8,500.00 MAD</text>
    ${card(50, 800, 2460, 90)}
    <circle cx="110" cy="845" r="24" fill="#fee2e2"/>
    <text x="155" y="840" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Loyer bureau Abdelmoumen</text>
    <text x="750" y="840" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Charges locatives</text>
    <text x="1300" y="840" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">08 Mars 2026</text>
    <text x="2450" y="850" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#dc2626" text-anchor="end">-8,000.00 MAD</text>
    <text x="70" y="950" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a">Actions rapides</text>
    ${card(50, 975, 580, 130)} <text x="340" y="1045" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b" text-anchor="middle" font-weight="500">Scanner de recus</text>
    ${card(670, 975, 580, 130)} <text x="960" y="1045" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b" text-anchor="middle" font-weight="500">Nouvelle facture</text>
    ${card(1290, 975, 580, 130)} <text x="1580" y="1045" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b" text-anchor="middle" font-weight="500">Import bancaire</text>
    ${card(1910, 975, 600, 130)} <text x="2210" y="1045" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b" text-anchor="middle" font-weight="500">Gestion salaries</text>
  `))).png().toFile('google-play-release/screenshots/chromebook_01_dashboard.png');
  console.log('chromebook_01_dashboard.png');

  // 02 Banque
  await sharp(Buffer.from(chromebookFrame(`
    <text x="70" y="105" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#0f172a">Banque</text>
    ${card(50, 155, 2460, 140)}
    <circle cx="125" cy="225" r="36" fill="#ede9fe"/>
    <text x="185" y="212" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a">CIH Bank - Compte Professionnel</text>
    <text x="185" y="245" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">**** **** **** 4521</text>
    <text x="2450" y="230" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="800" fill="#7c3aed" text-anchor="end">156,450.00 MAD</text>
    <rect x="50" y="320" width="220" height="50" rx="25" fill="#7c3aed"/><text x="160" y="352" font-family="Inter,Arial,sans-serif" font-size="18" fill="white" text-anchor="middle" font-weight="600">Toutes</text>
    <rect x="285" y="320" width="220" height="50" rx="25" fill="#fff" stroke="#e8eaed" stroke-width="1.5"/><text x="395" y="352" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b" text-anchor="middle">Entrees</text>
    <rect x="520" y="320" width="220" height="50" rx="25" fill="#fff" stroke="#e8eaed" stroke-width="1.5"/><text x="630" y="352" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b" text-anchor="middle">Sorties</text>
    <text x="70" y="420" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="600" fill="#64748b">Mars 2026</text>
    ${card(50, 440, 2460, 90)}
    <circle cx="110" cy="485" r="24" fill="#dcfce7"/>
    <text x="155" y="490" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Virement client Atlas Corp</text>
    <text x="1050" y="490" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">12 Mars 2026</text>
    <text x="2450" y="490" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00 MAD</text>
    ${card(50, 540, 2460, 90)}
    <circle cx="110" cy="585" r="24" fill="#fee2e2"/>
    <text x="155" y="590" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Paiement fournisseur Marjane</text>
    <text x="1050" y="590" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">11 Mars 2026</text>
    <text x="2450" y="590" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#dc2626" text-anchor="end">-12,500.00 MAD</text>
    ${card(50, 640, 2460, 90)}
    <circle cx="110" cy="685" r="24" fill="#dcfce7"/>
    <text x="155" y="690" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Encaissement cheque #1245</text>
    <text x="1050" y="690" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">10 Mars 2026</text>
    <text x="2450" y="690" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#16a34a" text-anchor="end">+28,750.00 MAD</text>
    ${card(50, 740, 2460, 90)}
    <circle cx="110" cy="785" r="24" fill="#fee2e2"/>
    <text x="155" y="790" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Salaires Mars 2026</text>
    <text x="1050" y="790" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">09 Mars 2026</text>
    <text x="2450" y="790" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#dc2626" text-anchor="end">-34,000.00 MAD</text>
    ${card(50, 840, 2460, 90)}
    <circle cx="110" cy="885" r="24" fill="#fee2e2"/>
    <text x="155" y="890" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Loyer bureau Abdelmoumen</text>
    <text x="1050" y="890" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">08 Mars 2026</text>
    <text x="2450" y="890" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#dc2626" text-anchor="end">-8,000.00 MAD</text>
    ${card(50, 940, 2460, 90)}
    <circle cx="110" cy="985" r="24" fill="#dcfce7"/>
    <text x="155" y="990" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600" fill="#0f172a">Paiement client Sahara Digital</text>
    <text x="1050" y="990" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">07 Mars 2026</text>
    <text x="2450" y="990" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#16a34a" text-anchor="end">+32,500.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/chromebook_02_banque.png');
  console.log('chromebook_02_banque.png');

  // 03 Factures
  await sharp(Buffer.from(chromebookFrame(`
    <text x="70" y="105" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#0f172a">Factures</text>
    <rect x="2260" y="72" width="220" height="52" rx="16" fill="#7c3aed"/><text x="2370" y="105" font-family="Inter,Arial,sans-serif" font-size="18" fill="white" text-anchor="middle" font-weight="600">+ Nouvelle</text>
    ${card(50, 155, 790, 140)}
    <text x="90" y="200" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Total facture</text>
    <text x="90" y="252" font-family="Inter,Arial,sans-serif" font-size="38" font-weight="800" fill="#0f172a">245,800 MAD</text>
    ${card(880, 155, 790, 140)}
    <text x="920" y="200" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Payees</text>
    <text x="920" y="252" font-family="Inter,Arial,sans-serif" font-size="38" font-weight="800" fill="#16a34a">198,300 MAD</text>
    ${card(1710, 155, 800, 140)}
    <text x="1750" y="200" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">En attente</text>
    <text x="1750" y="252" font-family="Inter,Arial,sans-serif" font-size="38" font-weight="800" fill="#f59e0b">47,500 MAD</text>
    ${card(50, 325, 2460, 100)}
    <text x="90" y="385" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">FAC-2026-087</text>
    <rect x="320" y="365" width="80" height="28" rx="14" fill="#dcfce7"/><text x="360" y="384" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="900" y="385" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Atlas Corp</text>
    <text x="1400" y="385" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">12 Mars 2026</text>
    <text x="2450" y="385" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#7c3aed" text-anchor="end">15,000.00 MAD</text>
    ${card(50, 435, 2460, 100)}
    <text x="90" y="495" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">FAC-2026-086</text>
    <rect x="320" y="475" width="110" height="28" rx="14" fill="#fef3c7"/><text x="375" y="494" font-family="Inter,Arial,sans-serif" font-size="14" fill="#d97706" text-anchor="middle" font-weight="600">En attente</text>
    <text x="900" y="495" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Sahara Digital</text>
    <text x="1400" y="495" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">10 Mars 2026</text>
    <text x="2450" y="495" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#7c3aed" text-anchor="end">32,500.00 MAD</text>
    ${card(50, 545, 2460, 100)}
    <text x="90" y="605" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">FAC-2026-085</text>
    <rect x="320" y="585" width="80" height="28" rx="14" fill="#dcfce7"/><text x="360" y="604" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="900" y="605" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Maroc Telecom</text>
    <text x="1400" y="605" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">08 Mars 2026</text>
    <text x="2450" y="605" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#7c3aed" text-anchor="end">8,900.00 MAD</text>
    ${card(50, 655, 2460, 100)}
    <text x="90" y="715" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">FAC-2026-084</text>
    <rect x="320" y="695" width="80" height="28" rx="14" fill="#dcfce7"/><text x="360" y="714" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="900" y="715" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">OCP Group</text>
    <text x="1400" y="715" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">05 Mars 2026</text>
    <text x="2450" y="715" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#7c3aed" text-anchor="end">55,000.00 MAD</text>
    ${card(50, 765, 2460, 100)}
    <text x="90" y="825" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">FAC-2026-083</text>
    <rect x="320" y="805" width="80" height="28" rx="14" fill="#dcfce7"/><text x="360" y="824" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="900" y="825" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">ONCF</text>
    <text x="1400" y="825" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">03 Mars 2026</text>
    <text x="2450" y="825" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#7c3aed" text-anchor="end">18,200.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/chromebook_03_factures.png');
  console.log('chromebook_03_factures.png');

  // 04 Salaries
  await sharp(Buffer.from(chromebookFrame(`
    <text x="70" y="105" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#0f172a">Salaries</text>
    <rect x="2260" y="72" width="220" height="52" rx="16" fill="#7c3aed"/><text x="2370" y="105" font-family="Inter,Arial,sans-serif" font-size="18" fill="white" text-anchor="middle" font-weight="600">+ Ajouter</text>
    ${card(50, 155, 2460, 100)}
    <circle cx="120" cy="205" r="30" fill="#ede9fe"/><text x="120" y="214" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#7c3aed" text-anchor="middle">AB</text>
    <text x="170" y="195" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">Ahmed Benali</text>
    <text x="170" y="225" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Developpeur Senior</text>
    <text x="1800" y="210" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a" text-anchor="end">12,000.00 MAD</text>
    <rect x="2330" y="193" width="100" height="28" rx="14" fill="#dcfce7"/><text x="2380" y="212" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(50, 270, 2460, 100)}
    <circle cx="120" cy="320" r="30" fill="#fef3c7"/><text x="120" y="329" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#d97706" text-anchor="middle">SE</text>
    <text x="170" y="310" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">Sara El Amrani</text>
    <text x="170" y="340" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Comptable</text>
    <text x="1800" y="325" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a" text-anchor="end">9,500.00 MAD</text>
    <rect x="2330" y="308" width="100" height="28" rx="14" fill="#dcfce7"/><text x="2380" y="327" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(50, 385, 2460, 100)}
    <circle cx="120" cy="435" r="30" fill="#dbeafe"/><text x="120" y="444" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#2563eb" text-anchor="middle">KM</text>
    <text x="170" y="425" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">Karim Mansouri</text>
    <text x="170" y="455" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Commercial</text>
    <text x="1800" y="440" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a" text-anchor="end">8,500.00 MAD</text>
    <rect x="2330" y="423" width="100" height="28" rx="14" fill="#fef3c7"/><text x="2380" y="442" font-family="Inter,Arial,sans-serif" font-size="14" fill="#d97706" text-anchor="middle" font-weight="600">Conge</text>
    ${card(50, 500, 2460, 100)}
    <circle cx="120" cy="550" r="30" fill="#d1fae5"/><text x="120" y="559" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700" fill="#059669" text-anchor="middle">FZ</text>
    <text x="170" y="540" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">Fatima Zahra Idrissi</text>
    <text x="170" y="570" font-family="Inter,Arial,sans-serif" font-size="17" fill="#64748b">Assistante RH</text>
    <text x="1800" y="555" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a" text-anchor="end">7,000.00 MAD</text>
    <rect x="2330" y="538" width="100" height="28" rx="14" fill="#dcfce7"/><text x="2380" y="557" font-family="Inter,Arial,sans-serif" font-size="14" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    <text x="70" y="660" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f172a">Masse salariale</text>
    ${card(50, 685, 2460, 110)}
    <text x="90" y="750" font-family="Inter,Arial,sans-serif" font-size="18" fill="#64748b">Total Mars 2026 - 4 salaries actifs</text>
    <text x="2450" y="750" font-family="Inter,Arial,sans-serif" font-size="38" font-weight="800" fill="#7c3aed" text-anchor="end">37,000.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/chromebook_04_salaries.png');
  console.log('chromebook_04_salaries.png');

  console.log('All Chromebook screenshots done!');
}
main().catch(console.error);
