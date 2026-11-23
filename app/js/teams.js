// Teams, on the stage: a legend of the map's teams, and the picking of one,
// which lights up what it is on and dims the rest. A team is people, not a
// shape — it is drawn nowhere — so this list is where one is found, and the
// map itself is where it is shown: the shapes it is on, as they are, with
// everything else stood back.
//
// The legend is a switch in the header, like Draw. The team that is lit is the
// diagram's to hold, since it is how the diagram draws; this asks it which,
// and tells main.js when a row is pressed. What a team is, and what it is on,
// is edited in the details panel, where a picked team has its own fields.

import { store, find, typesFor, teamMembers, oneLine } from './store.js';

const el = (id) => document.getElementById(id);

let handlers = {};
let editMode = false;
let showing = false;
/** Which teams are lit, by id, asked of whoever knows: the diagram, through main.js. */
let litTeams = () => [];

export const teamsShowing = () => showing;

/** What stands in for a Type on the teams that have none. */
const UNTYPED = 'Other teams';

/**
 * The teams by Type, in the order the map lists its Types, with the untyped
 * last. A Type nobody has is left out: the legend is of teams, not of words.
 */
function grouped() {
  const groups = new Map(typesFor('team').map((type) => [type, []]));
  for (const team of store.teams) {
    const type = team.type || UNTYPED;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(team);
  }
  const untyped = groups.get(UNTYPED);
  groups.delete(UNTYPED);
  if (untyped) groups.set(UNTYPED, untyped);
  return [...groups].filter(([, teams]) => teams.length > 0);
}

/** One row a team: its name, how many shapes it is on, and whether it is the one lit. */
function teamRow(team) {
  const lit = litTeams().includes(team.id);
  const picked = store.selection.type === 'team' && store.selection.id === team.id;
  const on = teamMembers(team).length;

  const row = document.createElement('button');
  row.type = 'button';
  row.className = `teams__row${picked ? ' teams__row--picked' : ''}`;
  row.dataset.id = team.id;
  row.setAttribute('aria-pressed', String(lit));
  row.title = team.description
    ? oneLine(team.description)
    : lit ? 'Lit on the map. Press again to put the map back.' : 'Light up what this team is on';
  const name = document.createElement('span');
  name.className = 'teams__name';
  name.textContent = oneLine(team.title);
  const count = document.createElement('span');
  count.className = 'teams__count';
  count.textContent = String(on);
  count.title = on === 0 ? 'On nothing yet' : `On ${on} ${on === 1 ? 'shape' : 'shapes'}`;
  row.append(name, count);
  row.addEventListener('click', () => handlers.onPick?.(team.id));
  return row;
}

/** Fill the legend from the map as it stands. */
export function renderTeams() {
  const panel = el('teams-panel');
  panel.hidden = !showing;
  el('teams-toggle').setAttribute('aria-pressed', String(showing));
  if (!showing) return;

  // A team that was lit and is gone — deleted, or another map opened — is lit no longer.
  const lit = litTeams();
  if (lit.some((id) => !find('team', id))) handlers.onLost?.(lit.filter((id) => find('team', id)));

  const groups = grouped();
  const list = el('teams-list');
  if (groups.length === 0) {
    const none = document.createElement('p');
    none.className = 'teams__none';
    none.textContent = editMode
      ? 'No teams yet. Add one, then put it on an area, a domain or a capability.'
      : 'This map names no teams yet.';
    list.replaceChildren(none);
  } else {
    list.replaceChildren(...groups.flatMap(([type, teams]) => {
      // One group and no Types named: the heading would say only "Other teams" over the only teams there are.
      if (groups.length === 1 && type === UNTYPED) return teams.map(teamRow);
      // A Type is pressed like a team: it lights up everything any team of
      // that Type is on — the map by what sort of team works on it.
      const all = teams.length === lit.length && teams.every((team) => lit.includes(team.id));
      const heading = document.createElement('button');
      heading.type = 'button';
      heading.className = 'teams__type';
      heading.textContent = type;
      heading.setAttribute('aria-pressed', String(all && teams.length > 0));
      heading.title = all ? 'Lit on the map. Press again to put the map back.' : `Light up what every one of these is on`;
      heading.addEventListener('click', () => handlers.onPickType?.(teams.map((team) => team.id)));
      return [heading, ...teams.map(teamRow)];
    }));
  }
  el('teams-add').hidden = !editMode;
}

/** Show the legend or put it away. Away, no team is lit: the map is the map again. */
export function showTeams(next) {
  if (showing === next) return;
  showing = next;
  if (!showing) handlers.onHide?.();
  renderTeams();
}

/** Editing, the legend can add a team; browsing, it is a list to pick from. */
export function setTeamsEditMode(next) {
  editMode = next;
  renderTeams();
}

/**
 * Wire the legend. `lit` answers which teams the diagram has lit; `onPick` is
 * a row pressed and `onPickType` a Type, with the teams of it; `onAdd` the
 * button that makes a team, `onHide` the legend put away, and `onLost` a lit
 * team that is no longer on the map, with the ones that still are.
 */
export function initTeams({ lit, ...callbacks }) {
  litTeams = lit;
  handlers = callbacks;
  el('teams-toggle').addEventListener('click', () => showTeams(!showing));
  el('teams-add').addEventListener('click', () => handlers.onAdd?.());
  renderTeams();
}
