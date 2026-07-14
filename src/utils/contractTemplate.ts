import type { Offer, Job } from '../models/types';

export interface ClientData {
  name: string;
  address: string;
  nip?: string;
  contactPerson?: string;
}

export interface ContractorData {
  name: string;
  address: string;
  nip?: string;
}

export interface ContractInput {
  job: Job;
  offer: Offer;
  client: ClientData;
  contractor: ContractorData;
  contractDate: string;      // 'YYYY-MM-DD'
  place: string;             // np. 'Koszalin'
}

export function buildContractHtml(input: ContractInput): string {
  const {
    job,
    offer,
    client,
    contractor,
    contractDate,
    place
  } = input;

  const plannedHours = job.plannedWorkHours ?? offer.settings?.workTime?.workTime ?? null;
  const plannedLaborCost = job.laborPlannedNet ?? offer.laborCost ?? null;

  const difficultyLabel = job.plannedDifficulty
    ? `${job.plannedDifficulty} / 5`
    : 'nieokreślona';

  const team = job.plannedTeam && job.plannedTeam.length > 0
    ? job.plannedTeam.join(', ')
    : 'według bieżącej dyspozycji Wykonawcy';

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<title>Umowa montażowa ${job.jobCode}</title>
<style>
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; line-height: 1.5; color: #111827; }
  h1, h2, h3 { margin: 0 0 8px; }
  .section { margin-bottom: 16px; }
  .small { font-size: 11px; color: #6B7280; }
  .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .table th, .table td { border: 1px solid #E5E7EB; padding: 4px 6px; vertical-align: top; }
  .flex-row { display: flex; justify-content: space-between; gap: 24px; }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; }
  .sign div { width: 40%; text-align: center; border-top: 1px solid #9CA3AF; padding-top: 4px; }
</style>
</head>
<body>

<div class="section">
  <h1>Umowa zlecenia montażowego nr ${job.jobCode}</h1>
  <p class="small">${place}, dnia ${contractDate}</p>
</div>

<div class="section">
  <h2>§1 Strony umowy</h2>
  <p>
    1. <strong>Zleceniodawca:</strong><br />
    ${client.name}<br />
    ${client.address}<br />
    ${client.nip ? `NIP: ${client.nip}<br />` : ''}
    ${client.contactPerson ? `Osoba kontaktowa: ${client.contactPerson}<br />` : ''}
  </p>
  <p>
    2. <strong>Wykonawca:</strong><br />
    ${contractor.name}<br />
    ${contractor.address}<br />
    ${contractor.nip ? `NIP: ${contractor.nip}<br />` : ''}
  </p>
</div>

<div class="section">
  <h2>§2 Przedmiot umowy</h2>
  <p>
    1. Przedmiotem umowy jest wykonanie montażu stolarki otworowej i/lub konstrukcji
    zgodnie z ofertą nr ${offer.number} oraz zakresem określonym w zleceniu
    wewnętrznym nr ${job.jobCode} (kod zlecenia: ${job.jobCode}).
  </p>
  <p>
    2. Miejsce montażu: <strong>${job.location}</strong>.
  </p>
  <p>
    3. Szacowany poziom trudności zlecenia: <strong>${difficultyLabel}</strong>.
  </p>
  <p>
    4. Planowany skład ekipy montażowej: <strong>${team}</strong>.
  </p>
</div>

<div class="section">
  <h2>§3 Wynagrodzenie i rozliczenie</h2>
  <table class="table">
    <thead>
      <tr>
        <th>Pozycja</th>
        <th>Opis</th>
        <th>Wartość</th>
      </tr>
    </thead>
    <tbody>
      ${plannedHours !== null
      ? `
      <tr>
        <td>Planowana liczba roboczogodzin</td>
        <td>Zgodnie z kalkulacją oferty / predykcją na podstawie danych historycznych</td>
        <td>${plannedHours.toFixed(2)} h</td>
      </tr>` : ''
    }
      ${plannedLaborCost !== null
      ? `
      <tr>
        <td>Planowany koszt robocizny</td>
        <td>Stawka roboczogodziny według obowiązującego cennika Wykonawcy</td>
        <td>${plannedLaborCost.toFixed(2)} PLN netto</td>
      </tr>` : ''
    }
      <tr>
        <td>Wartość montażu</td>
        <td>Zgodnie z ofertą nr ${offer.number}</td>
        <td>${(offer.totalCost || offer.totalNet || 0).toFixed(2)} PLN netto</td>
      </tr>
    </tbody>
  </table>
  <p class="small">
    Ostateczne wynagrodzenie może zostać skorygowane na podstawie rzeczywistego zakresu prac,
    udokumentowanego protokołami odbioru i wpisami czasu pracy (KOSTIQ), o ile strony tak uzgodnią.
  </p>
</div>

<div class="section">
  <h2>§4 Terminy realizacji</h2>
  <p>
    1. Planowany termin rozpoczęcia prac: ..................................................<br />
    2. Planowany termin zakończenia prac: ..................................................<br />
  </p>
  <p class="small">
    Dokładne terminy zostaną potwierdzone w harmonogramie montażu.
  </p>
</div>

<div class="section">
  <h2>§5 Obowiązki stron</h2>
  <p>
    1. Wykonawca zobowiązuje się do wykonania montażu zgodnie z zasadami sztuki budowlanej,
       wytycznymi systemodawców oraz obowiązującymi normami.
  </p>
  <p>
    2. Zleceniodawca zobowiązuje się do:
    <ul>
      <li>zapewnienia dostępu do frontu robót,</li>
      <li>zapewnienia mediów niezbędnych do wykonania prac,</li>
      <li>zapewnienia bezpiecznego składowania materiałów.</li>
    </ul>
  </p>
</div>

<div class="section">
  <h2>§6 Odbiór prac i gwarancja</h2>
  <p>
    1. Odbiór prac następuje na podstawie protokołu odbioru podpisanego przez obie strony.<br />
    2. Na wykonane prace montażowe Wykonawca udziela gwarancji na okres: ..................<br />
  </p>
</div>

<div class="section">
  <h2>§7 Postanowienia końcowe</h2>
  <p>
    1. W sprawach nieuregulowanych niniejszą umową zastosowanie mają przepisy Kodeksu cywilnego.<br />
    2. Umowa została sporządzona w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.
  </p>
</div>

<div class="sign">
  <div>
    ${client.name}<br />
    <span class="small">ZLECENIODAWCA</span>
  </div>
  <div>
    ${contractor.name}<br />
    <span class="small">WYKONAWCA</span>
  </div>
</div>

</body>
</html>
`;
}
