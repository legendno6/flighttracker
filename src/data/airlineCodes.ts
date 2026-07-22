export interface AirlineEntry {
  iata: string; // 2-character IATA code
  icao: string; // 3-character ICAO code
  name: string;
}

/**
 * Common commercial carriers, indexed both ways below. Not exhaustive —
 * unrecognized prefixes are still accepted, just without a friendly name.
 */
export const AIRLINES: AirlineEntry[] = [
  { iata: 'AA', icao: 'AAL', name: 'American Airlines' },
  { iata: 'DL', icao: 'DAL', name: 'Delta Air Lines' },
  { iata: 'UA', icao: 'UAL', name: 'United Airlines' },
  { iata: 'WN', icao: 'SWA', name: 'Southwest Airlines' },
  { iata: 'B6', icao: 'JBU', name: 'JetBlue Airways' },
  { iata: 'AS', icao: 'ASA', name: 'Alaska Airlines' },
  { iata: 'NK', icao: 'NKS', name: 'Spirit Airlines' },
  { iata: 'F9', icao: 'FFT', name: 'Frontier Airlines' },
  { iata: 'HA', icao: 'HAL', name: 'Hawaiian Airlines' },
  { iata: 'G4', icao: 'AAY', name: 'Allegiant Air' },
  { iata: 'SY', icao: 'SCX', name: 'Sun Country Airlines' },
  { iata: 'MX', icao: 'MXA', name: 'Breeze Airways' },
  { iata: 'AC', icao: 'ACA', name: 'Air Canada' },
  { iata: 'WS', icao: 'WJA', name: 'WestJet' },
  { iata: 'BA', icao: 'BAW', name: 'British Airways' },
  { iata: 'VS', icao: 'VIR', name: 'Virgin Atlantic' },
  { iata: 'LH', icao: 'DLH', name: 'Lufthansa' },
  { iata: 'AF', icao: 'AFR', name: 'Air France' },
  { iata: 'KL', icao: 'KLM', name: 'KLM Royal Dutch Airlines' },
  { iata: 'IB', icao: 'IBE', name: 'Iberia' },
  { iata: 'LX', icao: 'SWR', name: 'Swiss International Air Lines' },
  { iata: 'AZ', icao: 'ITY', name: 'ITA Airways' },
  { iata: 'TP', icao: 'TAP', name: 'TAP Air Portugal' },
  { iata: 'SK', icao: 'SAS', name: 'Scandinavian Airlines' },
  { iata: 'AY', icao: 'FIN', name: 'Finnair' },
  { iata: 'TK', icao: 'THY', name: 'Turkish Airlines' },
  { iata: 'EK', icao: 'UAE', name: 'Emirates' },
  { iata: 'EY', icao: 'ETD', name: 'Etihad Airways' },
  { iata: 'QR', icao: 'QTR', name: 'Qatar Airways' },
  { iata: 'SQ', icao: 'SIA', name: 'Singapore Airlines' },
  { iata: 'CX', icao: 'CPA', name: 'Cathay Pacific' },
  { iata: 'JL', icao: 'JAL', name: 'Japan Airlines' },
  { iata: 'NH', icao: 'ANA', name: 'All Nippon Airways' },
  { iata: 'KE', icao: 'KAL', name: 'Korean Air' },
  { iata: 'CI', icao: 'CAL', name: 'China Airlines' },
  { iata: 'QF', icao: 'QFA', name: 'Qantas' },
  { iata: 'NZ', icao: 'ANZ', name: 'Air New Zealand' },
  { iata: 'LA', icao: 'LAN', name: 'LATAM Airlines' },
  { iata: 'AM', icao: 'AMX', name: 'Aeromexico' },
  { iata: 'AV', icao: 'AVA', name: 'Avianca' },
  { iata: 'CM', icao: 'CMP', name: 'Copa Airlines' },
  { iata: 'AI', icao: 'AIC', name: 'Air India' },
  { iata: 'MH', icao: 'MAS', name: 'Malaysia Airlines' },
  { iata: 'TG', icao: 'THA', name: 'Thai Airways International' },
  { iata: 'EI', icao: 'EIN', name: 'Aer Lingus' },
  { iata: 'FR', icao: 'RYR', name: 'Ryanair' },
  { iata: 'U2', icao: 'EZY', name: 'easyJet' },
  { iata: 'VY', icao: 'VLG', name: 'Vueling' },
];

const byIata = new Map(AIRLINES.map((a) => [a.iata, a]));
const byIcao = new Map(AIRLINES.map((a) => [a.icao, a]));

export function findAirlineByIata(iata: string): AirlineEntry | null {
  return byIata.get(iata.toUpperCase()) ?? null;
}

export function findAirlineByIcao(icao: string): AirlineEntry | null {
  return byIcao.get(icao.toUpperCase()) ?? null;
}
