const sharp = require('sharp');

function card(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#ffffff" filter="url(#shadow)"/>`;
}

function xrFrame(content) {
  return `<svg width="3840" height="2160" xmlns="http://www.w3.org/2000/svg">
    <rect width="3840" height="2160" fill="#f5f5f7"/>
    <defs><filter id="shadow" x="-2%" y="-2%" width="104%" height="108%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-opacity="0.06"/></filter></defs>
    <rect width="3840" height="80" fill="#ffffff"/>
    <text x="1920" y="54" font-family="Inter,Arial,sans-serif" font-size="26" font-weight="600" fill="#0f172a" text-anchor="middle">9:41</text>
    <rect y="80" width="3840" height="100" fill="#ffffff"/>
    <rect x="0" y="179" width="3840" height="2" fill="#e8eaed"/>
    ${content}
  </svg>`;
}

async function main() {
  // 01 Dashboard
  await sharp(Buffer.from(xrFrame(`
    <text x="100" y="150" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800" fill="#0f172a">Tableau de bord</text>
    ${card(80, 220, 1180, 250)}
    <text x="140" y="300" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b">Chiffre d&#39;affaires</text>
    <text x="140" y="400" font-family="Inter,Arial,sans-serif" font-size="64" font-weight="800" fill="#0f172a">245,800 MAD</text>
    <rect x="140" y="418" width="100" height="36" rx="18" fill="#dcfce7"/><text x="190" y="442" font-family="Inter,Arial,sans-serif" font-size="20" fill="#16a34a" text-anchor="middle" font-weight="600">+12%</text>
    ${card(1320, 220, 1180, 250)}
    <text x="1380" y="300" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b">Depenses</text>
    <text x="1380" y="400" font-family="Inter,Arial,sans-serif" font-size="64" font-weight="800" fill="#0f172a">89,350 MAD</text>
    <rect x="1380" y="418" width="90" height="36" rx="18" fill="#fee2e2"/><text x="1425" y="442" font-family="Inter,Arial,sans-serif" font-size="20" fill="#dc2626" text-anchor="middle" font-weight="600">-5%</text>
    ${card(2560, 220, 1200, 250)}
    <text x="2620" y="300" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b">Solde bancaire</text>
    <text x="2620" y="400" font-family="Inter,Arial,sans-serif" font-size="64" font-weight="800" fill="#7c3aed">156,450 MAD</text>
    <text x="100" y="550" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="700" fill="#0f172a">Activite recente</text>
    ${card(80, 580, 3680, 130)}
    <circle cx="170" cy="645" r="36" fill="#ede9fe"/>
    <text x="230" y="638" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Facture #2026-087</text>
    <text x="1100" y="638" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Atlas Corp</text>
    <text x="1900" y="638" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">12 Mars 2026</text>
    <text x="3680" y="650" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#16a34a" text-anchor="end">+15,000.00 MAD</text>
    ${card(80, 720, 3680, 130)}
    <circle cx="170" cy="785" r="36" fill="#fef3c7"/>
    <text x="230" y="778" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Recu Marjane</text>
    <text x="1100" y="778" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Fournitures bureau</text>
    <text x="1900" y="778" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">11 Mars 2026</text>
    <text x="3680" y="790" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#dc2626" text-anchor="end">-2,340.00 MAD</text>
    ${card(80, 860, 3680, 130)}
    <circle cx="170" cy="925" r="36" fill="#dbeafe"/>
    <text x="230" y="918" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Virement CIH Bank</text>
    <text x="1100" y="918" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Compte principal</text>
    <text x="1900" y="918" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">10 Mars 2026</text>
    <text x="3680" y="930" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00 MAD</text>
    ${card(80, 1000, 3680, 130)}
    <circle cx="170" cy="1065" r="36" fill="#d1fae5"/>
    <text x="230" y="1058" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Bulletin Mars 2026</text>
    <text x="1100" y="1058" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Ahmed Benali</text>
    <text x="1900" y="1058" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">09 Mars 2026</text>
    <text x="3680" y="1070" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#dc2626" text-anchor="end">-8,500.00 MAD</text>
    ${card(80, 1140, 3680, 130)}
    <circle cx="170" cy="1205" r="36" fill="#fee2e2"/>
    <text x="230" y="1198" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Loyer bureau Abdelmoumen</text>
    <text x="1100" y="1198" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Charges locatives</text>
    <text x="1900" y="1198" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">08 Mars 2026</text>
    <text x="3680" y="1210" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#dc2626" text-anchor="end">-8,000.00 MAD</text>
    <text x="100" y="1360" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="700" fill="#0f172a">Actions rapides</text>
    ${card(80, 1400, 860, 190)} <text x="510" y="1510" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b" text-anchor="middle" font-weight="500">Scanner de recus</text>
    ${card(1010, 1400, 860, 190)} <text x="1440" y="1510" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b" text-anchor="middle" font-weight="500">Nouvelle facture</text>
    ${card(1940, 1400, 860, 190)} <text x="2370" y="1510" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b" text-anchor="middle" font-weight="500">Import bancaire</text>
    ${card(2870, 1400, 890, 190)} <text x="3315" y="1510" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b" text-anchor="middle" font-weight="500">Gestion salaries</text>
  `))).png().toFile('google-play-release/screenshots/xr_01_dashboard.png');
  console.log('xr_01_dashboard.png');

  // 02 Banque
  await sharp(Buffer.from(xrFrame(`
    <text x="100" y="150" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800" fill="#0f172a">Banque</text>
    ${card(80, 220, 3680, 200)}
    <circle cx="200" cy="320" r="50" fill="#ede9fe"/>
    <text x="280" y="305" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#0f172a">CIH Bank - Compte Professionnel</text>
    <text x="280" y="350" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b">**** **** **** 4521</text>
    <text x="3680" y="330" font-family="Inter,Arial,sans-serif" font-size="52" font-weight="800" fill="#7c3aed" text-anchor="end">156,450.00 MAD</text>
    <rect x="80" y="460" width="300" height="70" rx="35" fill="#7c3aed"/><text x="230" y="504" font-family="Inter,Arial,sans-serif" font-size="26" fill="white" text-anchor="middle" font-weight="600">Toutes</text>
    <rect x="400" y="460" width="300" height="70" rx="35" fill="#fff" stroke="#e8eaed" stroke-width="2"/><text x="550" y="504" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b" text-anchor="middle">Entrees</text>
    <rect x="720" y="460" width="300" height="70" rx="35" fill="#fff" stroke="#e8eaed" stroke-width="2"/><text x="870" y="504" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b" text-anchor="middle">Sorties</text>
    <text x="100" y="600" font-family="Inter,Arial,sans-serif" font-size="26" font-weight="600" fill="#64748b">Mars 2026</text>
    ${card(80, 630, 3680, 130)}
    <circle cx="170" cy="695" r="36" fill="#dcfce7"/>
    <text x="230" y="700" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Virement client Atlas Corp</text>
    <text x="1700" y="700" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">12 Mars 2026</text>
    <text x="3680" y="700" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#16a34a" text-anchor="end">+45,000.00 MAD</text>
    ${card(80, 770, 3680, 130)}
    <circle cx="170" cy="835" r="36" fill="#fee2e2"/>
    <text x="230" y="840" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Paiement fournisseur Marjane</text>
    <text x="1700" y="840" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">11 Mars 2026</text>
    <text x="3680" y="840" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#dc2626" text-anchor="end">-12,500.00 MAD</text>
    ${card(80, 910, 3680, 130)}
    <circle cx="170" cy="975" r="36" fill="#dcfce7"/>
    <text x="230" y="980" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Encaissement cheque #1245</text>
    <text x="1700" y="980" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">10 Mars 2026</text>
    <text x="3680" y="980" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#16a34a" text-anchor="end">+28,750.00 MAD</text>
    ${card(80, 1050, 3680, 130)}
    <circle cx="170" cy="1115" r="36" fill="#fee2e2"/>
    <text x="230" y="1120" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Salaires Mars 2026</text>
    <text x="1700" y="1120" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">09 Mars 2026</text>
    <text x="3680" y="1120" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#dc2626" text-anchor="end">-34,000.00 MAD</text>
    ${card(80, 1190, 3680, 130)}
    <circle cx="170" cy="1255" r="36" fill="#fee2e2"/>
    <text x="230" y="1260" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Loyer bureau Abdelmoumen</text>
    <text x="1700" y="1260" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">08 Mars 2026</text>
    <text x="3680" y="1260" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#dc2626" text-anchor="end">-8,000.00 MAD</text>
    ${card(80, 1330, 3680, 130)}
    <circle cx="170" cy="1395" r="36" fill="#dcfce7"/>
    <text x="230" y="1400" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="#0f172a">Paiement client Sahara Digital</text>
    <text x="1700" y="1400" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">07 Mars 2026</text>
    <text x="3680" y="1400" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#16a34a" text-anchor="end">+32,500.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/xr_02_banque.png');
  console.log('xr_02_banque.png');

  // 03 Factures
  await sharp(Buffer.from(xrFrame(`
    <text x="100" y="150" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800" fill="#0f172a">Factures</text>
    <rect x="3380" y="102" width="300" height="70" rx="20" fill="#7c3aed"/><text x="3530" y="146" font-family="Inter,Arial,sans-serif" font-size="26" fill="white" text-anchor="middle" font-weight="600">+ Nouvelle</text>
    ${card(80, 220, 1180, 200)}
    <text x="140" y="295" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Total facture</text>
    <text x="140" y="365" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" fill="#0f172a">245,800 MAD</text>
    ${card(1320, 220, 1180, 200)}
    <text x="1380" y="295" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Payees</text>
    <text x="1380" y="365" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" fill="#16a34a">198,300 MAD</text>
    ${card(2560, 220, 1200, 200)}
    <text x="2620" y="295" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">En attente</text>
    <text x="2620" y="365" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" fill="#f59e0b">47,500 MAD</text>
    ${card(80, 460, 3680, 130)}
    <text x="140" y="540" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">FAC-2026-087</text>
    <rect x="470" y="515" width="110" height="36" rx="18" fill="#dcfce7"/><text x="525" y="539" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="1300" y="540" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Atlas Corp</text>
    <text x="2200" y="540" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">12 Mars 2026</text>
    <text x="3680" y="540" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#7c3aed" text-anchor="end">15,000.00 MAD</text>
    ${card(80, 600, 3680, 130)}
    <text x="140" y="680" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">FAC-2026-086</text>
    <rect x="470" y="655" width="150" height="36" rx="18" fill="#fef3c7"/><text x="545" y="679" font-family="Inter,Arial,sans-serif" font-size="18" fill="#d97706" text-anchor="middle" font-weight="600">En attente</text>
    <text x="1300" y="680" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Sahara Digital</text>
    <text x="2200" y="680" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">10 Mars 2026</text>
    <text x="3680" y="680" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#7c3aed" text-anchor="end">32,500.00 MAD</text>
    ${card(80, 740, 3680, 130)}
    <text x="140" y="820" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">FAC-2026-085</text>
    <rect x="470" y="795" width="110" height="36" rx="18" fill="#dcfce7"/><text x="525" y="819" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="1300" y="820" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Maroc Telecom</text>
    <text x="2200" y="820" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">08 Mars 2026</text>
    <text x="3680" y="820" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#7c3aed" text-anchor="end">8,900.00 MAD</text>
    ${card(80, 880, 3680, 130)}
    <text x="140" y="960" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">FAC-2026-084</text>
    <rect x="470" y="935" width="110" height="36" rx="18" fill="#dcfce7"/><text x="525" y="959" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="1300" y="960" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">OCP Group</text>
    <text x="2200" y="960" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">05 Mars 2026</text>
    <text x="3680" y="960" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#7c3aed" text-anchor="end">55,000.00 MAD</text>
    ${card(80, 1020, 3680, 130)}
    <text x="140" y="1100" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">FAC-2026-083</text>
    <rect x="470" y="1075" width="110" height="36" rx="18" fill="#dcfce7"/><text x="525" y="1099" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Payee</text>
    <text x="1300" y="1100" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">ONCF</text>
    <text x="2200" y="1100" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">03 Mars 2026</text>
    <text x="3680" y="1100" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#7c3aed" text-anchor="end">18,200.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/xr_03_factures.png');
  console.log('xr_03_factures.png');

  // 04 Salaries
  await sharp(Buffer.from(xrFrame(`
    <text x="100" y="150" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800" fill="#0f172a">Salaries</text>
    <rect x="3380" y="102" width="300" height="70" rx="20" fill="#7c3aed"/><text x="3530" y="146" font-family="Inter,Arial,sans-serif" font-size="26" fill="white" text-anchor="middle" font-weight="600">+ Ajouter</text>
    ${card(80, 220, 3680, 140)}
    <circle cx="180" cy="290" r="42" fill="#ede9fe"/><text x="180" y="302" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" fill="#7c3aed" text-anchor="middle">AB</text>
    <text x="250" y="275" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">Ahmed Benali</text>
    <text x="250" y="315" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Developpeur Senior</text>
    <text x="2800" y="300" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#0f172a" text-anchor="end">12,000.00 MAD</text>
    <rect x="3500" y="275" width="140" height="36" rx="18" fill="#dcfce7"/><text x="3570" y="299" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(80, 380, 3680, 140)}
    <circle cx="180" cy="450" r="42" fill="#fef3c7"/><text x="180" y="462" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" fill="#d97706" text-anchor="middle">SE</text>
    <text x="250" y="435" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">Sara El Amrani</text>
    <text x="250" y="475" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Comptable</text>
    <text x="2800" y="460" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#0f172a" text-anchor="end">9,500.00 MAD</text>
    <rect x="3500" y="435" width="140" height="36" rx="18" fill="#dcfce7"/><text x="3570" y="459" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    ${card(80, 540, 3680, 140)}
    <circle cx="180" cy="610" r="42" fill="#dbeafe"/><text x="180" y="622" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" fill="#2563eb" text-anchor="middle">KM</text>
    <text x="250" y="595" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">Karim Mansouri</text>
    <text x="250" y="635" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Commercial</text>
    <text x="2800" y="620" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#0f172a" text-anchor="end">8,500.00 MAD</text>
    <rect x="3500" y="595" width="140" height="36" rx="18" fill="#fef3c7"/><text x="3570" y="619" font-family="Inter,Arial,sans-serif" font-size="18" fill="#d97706" text-anchor="middle" font-weight="600">Conge</text>
    ${card(80, 700, 3680, 140)}
    <circle cx="180" cy="770" r="42" fill="#d1fae5"/><text x="180" y="782" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" fill="#059669" text-anchor="middle">FZ</text>
    <text x="250" y="755" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#0f172a">Fatima Zahra Idrissi</text>
    <text x="250" y="795" font-family="Inter,Arial,sans-serif" font-size="24" fill="#64748b">Assistante RH</text>
    <text x="2800" y="780" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#0f172a" text-anchor="end">7,000.00 MAD</text>
    <rect x="3500" y="755" width="140" height="36" rx="18" fill="#dcfce7"/><text x="3570" y="779" font-family="Inter,Arial,sans-serif" font-size="18" fill="#16a34a" text-anchor="middle" font-weight="600">Actif</text>
    <text x="100" y="930" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="700" fill="#0f172a">Masse salariale</text>
    ${card(80, 960, 3680, 150)}
    <text x="140" y="1050" font-family="Inter,Arial,sans-serif" font-size="26" fill="#64748b">Total Mars 2026 - 4 salaries actifs</text>
    <text x="3680" y="1050" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" fill="#7c3aed" text-anchor="end">37,000.00 MAD</text>
  `))).png().toFile('google-play-release/screenshots/xr_04_salaries.png');
  console.log('xr_04_salaries.png');

  console.log('All Android XR screenshots done!');
}
main().catch(console.error);
