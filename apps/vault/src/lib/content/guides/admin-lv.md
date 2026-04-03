# Administratora rokasgrāmata

_Pārskats par lomām un tiesībām — kurš ko var darīt_

---

## Ievads

Polyphony Vault ir veidots uz lomu pamata. Tas nozīmē, ka katram lietotājam ir noteiktas tiesības atbilstoši viņa uzdevumam korī.

**Ņem vērā:** Vienai personai var būt **vairākas lomas vienlaikus**. Piemēram, kora vadītājs var būt vienlaikus gan administrators, gan nošu krājuma pārzinis. Tiesības summējas — ja viena loma atļauj kādu darbību, tā ir atļauta, pat ja cita loma to tieši nemin.

---

## Lomu apraksti

### Īpašnieks (Owner)

Vides izveidotājs un vadības loceklis. **Pats nenodarbojas ar nošu vai mēģinājumu pārvaldīšanu** — vajadzības gadījumā piešķir sev atbilstošās lomas.

**Uzdevumi:**

- Piešķir citiem dalībniekiem lomas (t.sk. citus īpašniekus)
- Pārvalda lietotnes tehniskos iestatījumus
- Atbild par visas vides darbību
- Vajadzības gadījumā var piešķirt sev administratora, bibliotekāra vai diriģenta lomu

**Kam piemērota:** Kora priekšsēdētājs, valdes priekšsēdētājs vai IT atbalsts.

**NB:** Katrā korī vienmēr jābūt vismaz vienam aktīvam lietotājam ar īpašnieka tiesībām.

---

### Administrators (Admin)

Kārto dalībnieku sarakstu. **Nenodarbojas ar nošu pievienošanu** — tā ir atsevišķa loma.

**Uzdevumi:**

- Pievieno jaunus dziedātājus sarakstam un nosūta viņiem uzaicinājumus
- Piešķir dalībniekiem lomas (izņemot īpašnieka lomu — to var mainīt tikai īpašnieks)
- Vajadzības gadījumā izņem dalībniekus no saraksta

**Kam piemērota:** Kora sekretārs, valdes loceklis vai kora vecākais.

**Padoms:** Ja administrators nodarbojas arī ar notīm, viņš var vienkārši pievienot sev arī bibliotekāra lomu.

---

### Bibliotekārs (Librarian)

Rūpējas par nošu krājuma kārtību.

**Uzdevumi:**

- Augšupielādē jaunus darbus un notis (PDF)
- Pievieno darbiem informāciju (komponists, aranžētājs, licence)
- Dzēš novecojušus vai kļūdainus failus

**Kam piemērota:** Nošu krājuma pārzinis, arhivārs vai diriģenta palīgs.

---

### Diriģents (Conductor)

Kārto mēģinājumu grafiku un seko līdzi dalībai.

**Uzdevumi:**

- Izveido kalendārā mēģinājumus un koncertus ("Events")
- Maina pasākumu laikus un informāciju
- Atzīmē klātesošos un kavētājus

**Kam piemērota:** Galvenais diriģents, kordiriģents vai palīgdiriģents.

---

### Balsu grupas vadītājs (Section Leader)

Palīdz uzskaitīt apmeklējumu.

**Uzdevumi:**

- Atzīmē dalībnieku apmeklējumu mēģinājumos

**Kam piemērota:** Soprānu, altu, tenoru vai basu vecākais.

---

## Tiesību tabula

Ātrais pārskats, kādas darbības ir atļautas dažādām lomām:

| Darbība                                     | Īpašnieks | Admins | Bibliotekārs | Diriģents | Balsu gr. vad. | Parasts dziedātājs |
| :------------------------------------------ | :-------: | :----: | :----------: | :-------: | :------------: | :----------------: |
| Nošu skatīšana un lejupielāde               |    ✅     |   ✅   |      ✅      |    ✅     |       ✅       |         ✅         |
| **Nošu pievienošana un mainīšana**          |    ❌     |   ❌   |      ✅      |    ❌     |       ❌       |         ❌         |
| **Dalībnieku uzaicināšana un pārvaldīšana** |    ✅     |   ✅   |      ❌      |    ❌     |       ❌       |         ❌         |
| **Lomu mainīšana**                          |    ✅     |  ✅¹   |      ❌      |    ❌     |       ❌       |         ❌         |
| **Mēģinājumu pievienošana kalendāram**      |    ❌     |   ❌   |      ❌      |    ✅     |       ❌       |         ❌         |
| **Apmeklējuma atzīmēšana**                  |    ❌     |   ❌   |      ❌      |    ✅     |       ✅       |         ❌         |
| **Iestatījumu pārvaldīšana**                |    ✅     |   ✅   |      ❌      |    ❌     |       ❌       |         ❌         |
| Vides dzēšana                               |    ✅     |   ❌   |      ❌      |    ❌     |       ❌       |         ❌         |

**Paskaidrojumi:**

- ✅ = Atļauts
- ❌ = Nav atļauts
- ¹ Admins var mainīt visas lomas **izņemot īpašnieka lomu** — to var mainīt tikai īpašnieks.
- **Parasts dziedātājs** = Katrs pieteicies dalībnieks, kuram nav nevienas papildlomas.
- **Īpašnieks** var pievienot sev lomas (Bibliotekārs, Diriģents utt.), ja nepieciešamas attiecīgās tiesības.
- **Individuālās atbildības uzticēšana (Trust Individual Responsibility):** Ja šis iestatījums ir ieslēgts, arī parastie dziedātāji var paši atzīmēt savu RSVP un apmeklējumu. Pēc noklusējuma tas ir atļauts tikai īpašniekiem, administratoriem, diriģentiem un balsu grupas vadītājiem.

---

## Kā...

### ...pievienot jaunu dziedātāju?

Dalībnieka pievienošana notiek divos soļos:

1. **Admins** (vai īpašnieks) izvēlnē izvēlas **"Members"** un noklikšķina **"Add Roster Member"**.
2. Ievada dziedātāja vārdu un piešķir atbilstošu balsu grupu (piem., "Soprāns" vai "Bass"). Saglabā.
3. Atver tikko pievienoto dalībnieka profilu un noklikšķina **"Send Invitation"**.
   > Dalībnieks saņem unikālu uzaicinājuma saiti, ar kuru var reģistrēties un piekļūt notīm. E-pasta adresi nav nepieciešams zināt uzaicinājuma brīdī — dalībnieks vispirms tiek pievienots sarakstam, uzaicinājums tiek nosūtīts vēlāk.

### ...pievienot jaunu noti?

1. **Bibliotekārs** atver **"Works"**.
2. Izvēlas **"Add Work"** (pievienot darbu).
3. Augšupielādē PDF failu un aizpilda nepieciešamos datus (nosaukums, autors).

### ...organizēt mēģinājumu?

1. **Diriģents** atver **"Events"**.
2. Izveido jaunu pasākumu, norādot datumu un laiku.
3. Pēc mēģinājuma atver to pašu pasākumu un atzīmē, kurš bija klāt.

### ...pārvaldīt iestatījumus?

**Īpašnieks** vai **administrators** var piekļūt iestatījumu lapai (**"Settings"**). No turienes var:

- Mainīt noklusējuma pasākuma ilgumu
- Noteikt kora noklusējuma valodu un laika joslu
- Ieslēgt/izslēgt **Individuālās atbildības uzticēšanu** — ja tā ir ieslēgta, dalībnieki paši var pārvaldīt savu RSVP un apmeklējumu.

---

## Jaunie saraksta dalībnieki (roster-only)

Dziedātājus var pievienot sarakstam **pirms** uzaicinājuma nosūtīšanas. Šādu dalībnieku sauc par _saraksta dalībnieku_ (roster-only):

- Viņš ir redzams dalības statistikā un pasākumu sarakstos
- Viņš **nevar pieteikties** pirms uzaicinājuma nosūtīšanas un reģistrācijas pabeigšanas
- Uzaicinājuma nosūtīšanas brīdī viņam var iepriekš piešķirt lomas — tās aktivizējas uzreiz pēc reģistrācijas

Šis divpakāpju modelis ļauj uzturēt kora sarakstu kārtībā arī pirms visu dziedātāju reģistrācijas pabeigšanas.

---

## Pirmie soļi jaunajam pārvaldniekam

Ja tikko esi saņēmis administratora vai īpašnieka tiesības, iesakām sākt šādi:

1. **Pārskatiet savas lomas.**
   Dodies uz lapu "Members" un atrodi sarakstā savu vārdu. Pārliecinies, ka tev ir visas nepieciešamās lomas sava darba veikšanai.

2. **Pievieno kora dalībniekus sarakstam.**
   Izmanto "Add Roster Member" pogu, lai pievienotu dziedātājus pa balsu grupām. Pēc tam nosūti viņiem uzaicinājumus caur "Send Invitation".

3. **Iecel palīgus.**
   Atrodi sarakstā cilvēkus, kas palīdzēs pārvaldīt notis vai mēģinājumus, un pievieno viņiem atbilstošās lomas (piem., _Admin_ vai _Librarian_). Tam noklikšķini uz lomas pogas pie dalībnieka vārda.

4. **Sakārto balsu grupas.**
   Pārliecinies, ka katram dziedātājam ir atzīmēta pareizā balsu grupa (piem., Soprāns 1, Tenors 2). Tas ir svarīgi, kad sāksiet atzīmēt apmeklējumu mēģinājumos.

---

## Biežāk uzdotie jautājumi

**Kāpēc es nevaru augšupielādēt notis?**
Visticamāk tev trūkst **Bibliotekāra (Librarian)** lomas. Lūdz administratoram vai īpašniekam to pievienot.

**Kāpēc es neredzu "Add Roster Member" pogu?**
Tev trūkst **Administratora (Admin)** lomas. Tikai administratori un īpašnieki var pievienot dalībniekus.

**Vai es varu noņemt dalībniekam lomu?**
Jā. Lapā "Members" noklikšķinot uz aktīvās lomas (piem., zilā "Admin" poga), tā kļūst neaktīva un tiesības tiek noņemtas nekavējoties.

---

_Rokasgrāmata atjaunināta: 20.02.2026_
