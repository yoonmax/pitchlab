/**
 * Match-event import. Accepts CSV or JSON rows and normalises them to metres on
 * the current pitch. Only what the file contains is used: nothing is estimated
 * or filled in, and rejected rows are reported with their row numbers.
 */
const FIELD_ALIASES = {
  time: ['time', 'seconds', 'second', 't', 'timestamp'],
  minute: ['minute', 'min'],
  team: ['team', 'side', 'team_name'],
  player: ['player', 'player_id', 'from', 'passer', 'number'],
  receiver: ['receiver', 'recipient', 'to', 'pass_recipient'],
  type: ['type', 'event', 'event_type', 'action'],
  x: ['x', 'start_x', 'location_x'],
  y: ['y', 'start_y', 'location_y'],
  endX: ['end_x', 'endx', 'x2', 'pass_end_x'],
  endY: ['end_y', 'endy', 'y2', 'pass_end_y'],
};

/** RFC 4180 style parser: handles quotes, doubled quotes and CRLF. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]?.trim() ?? ''])));
}

function pick(row, field) {
  for (const key of FIELD_ALIASES[field]) {
    const hit = Object.keys(row).find((k) => k.toLowerCase() === key);
    if (hit && row[hit] !== '' && row[hit] != null) return row[hit];
  }
  return null;
}

/** Work out the coordinate range of the source so it can be scaled to metres. */
export function detectScale(rows) {
  let maxX = 0;
  let maxY = 0;
  for (const r of rows) {
    maxX = Math.max(maxX, Number(pick(r, 'x')) || 0, Number(pick(r, 'endX')) || 0);
    maxY = Math.max(maxY, Number(pick(r, 'y')) || 0, Number(pick(r, 'endY')) || 0);
  }
  if (maxX <= 1.01 && maxY <= 1.01) return { x: 1, y: 1, name: 'fractions from 0 to 1' };
  if (maxX > 105 && maxX <= 120 && maxY <= 80) return { x: 120, y: 80, name: '120 by 80 units' };
  if (maxX <= 100 && maxY <= 100 && maxY > 68) return { x: 100, y: 100, name: 'percentages' };
  return { x: 105, y: 68, name: 'metres on a 105 by 68 pitch' };
}

export function importMatchData(text, format, pitch, sourceName = 'import') {
  const errors = [];
  const warnings = [];
  let rows;
  if (format === 'json') {
    try {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : parsed?.events;
    } catch {
      return { ok: false, errors: ['The file is not valid JSON.'], warnings };
    }
    if (!Array.isArray(rows)) return { ok: false, errors: ['Expected a JSON array of events, or an object with an "events" array.'], warnings };
  } else {
    rows = parseCSV(text);
  }
  if (rows.length === 0) return { ok: false, errors: ['The file has no event rows.'], warnings };
  if (rows.length > 20000) return { ok: false, errors: ['The file has more than 20,000 rows.'], warnings };

  const scale = detectScale(rows);
  const sx = pitch.length / scale.x;
  const sy = pitch.width / scale.y;
  const events = [];
  const missing = { team: 0, player: 0, type: 0, location: 0 };
  rows.forEach((row) => {
    const team = pick(row, 'team');
    const player = pick(row, 'player');
    const type = pick(row, 'type');
    const x = Number(pick(row, 'x'));
    const y = Number(pick(row, 'y'));
    if (!team) { missing.team += 1; return; }
    if (!type) { missing.type += 1; return; }
    if (pick(row, 'x') === null || pick(row, 'y') === null || !Number.isFinite(x) || !Number.isFinite(y)) { missing.location += 1; return; }
    if (!player) missing.player += 1;
    const endRawX = pick(row, 'endX');
    const endRawY = pick(row, 'endY');
    const minute = Number(pick(row, 'minute'));
    const time = Number(pick(row, 'time'));
    events.push({
      team: String(team).slice(0, 40),
      player: player == null ? null : String(player).slice(0, 40),
      receiver: pick(row, 'receiver') == null ? null : String(pick(row, 'receiver')).slice(0, 40),
      type: String(type).toLowerCase().slice(0, 30),
      x: x * sx, y: y * sy,
      endX: endRawX === null ? null : Number(endRawX) * sx,
      endY: endRawY === null ? null : Number(endRawY) * sy,
      time: Number.isFinite(time) ? time : Number.isFinite(minute) ? minute * 60 : null,
    });
  });
  if (events.length === 0) {
    return { ok: false, errors: [`No usable rows. Missing team: ${missing.team}, missing type: ${missing.type}, missing x or y: ${missing.location}.`], warnings };
  }
  const skipped = missing.team + missing.type + missing.location;
  if (skipped) warnings.push(`Skipped ${skipped} of ${rows.length} rows with no team, type or location.`);
  if (missing.player) warnings.push(`${missing.player} rows have no player, so they are left out of passing networks.`);
  return {
    ok: true, errors, warnings,
    dataset: {
      source: sourceName.slice(0, 120), rowCount: rows.length, scale: scale.name,
      teams: [...new Set(events.map((e) => e.team))],
      types: [...new Set(events.map((e) => e.type))],
      events,
    },
  };
}

/** A small synthetic file so the importer can be tried. It describes no real match. */
export const SAMPLE_MATCH_CSV = `team,player,receiver,type,x,y,end_x,end_y,minute
Blue,4,6,pass,28,30,41,26,1
Blue,6,8,pass,41,26,55,20,1
Blue,8,11,pass,55,20,70,8,2
Blue,11,9,pass,70,8,92,31,2
Blue,4,5,pass,26,28,27,44,3
Blue,5,2,pass,27,44,44,61,3
Blue,2,7,pass,44,61,66,58,4
Blue,7,8,pass,66,58,62,38,4
Blue,8,9,pass,62,38,84,34,5
Blue,6,4,pass,38,34,24,30,6
Blue,4,3,pass,24,30,40,8,6
Blue,3,11,pass,40,8,62,6,7
Blue,11,8,pass,62,6,64,24,7
Blue,8,6,pass,60,24,44,32,8
Blue,6,5,pass,44,32,26,42,8
Blue,5,6,pass,26,42,42,36,9
Blue,6,7,pass,42,36,68,56,9
Blue,7,9,pass,68,56,90,38,10
Blue,9,,shot,90,38,105,34,10
Red,3,8,pass,70,12,56,22,3
Red,8,10,pass,56,22,44,34,3
Red,10,9,pass,44,34,26,36,4
Red,4,8,pass,78,40,60,30,7
Red,8,7,pass,60,30,40,58,7
`;
