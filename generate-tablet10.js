const sharp = require('sharp');

function card(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#ffffff" filter="url(#shadow)"/>`;
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
  `))).png().toFile('google-play-release/screenshots/tablet10_01_dashboard.png');
  console.log('tablet10_01_dashboard.png');

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
  `))).png().toFile('google-play-release/screenshots/tablet10_02_banque.png');
  console.log('tablet10_02_banque.png');

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
  `))).png().toFile('google-play-release/screenshots/tablet10_03_factures.png');
  console.log('tablet10_03_factures.png');

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
  `))).png().toFile('google-play-release/screenshots/tablet10_04_salaries.png');
  console.log('tablet10_04_salaries.png');

  console.log('All tablet 10" screenshots done!');
}
main().catch(console.error);
