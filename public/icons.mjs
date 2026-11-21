const paths={
  search:'M15 15l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  copy:'M8 8h12v13H8zM4 16V3h12',
  profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8a8 6 0 0 1 16 0',
  board:'M3 3h18v18H3zM9 3v18m6-18v18M3 9h18M3 15h18',
  book:'M12 5v15M3 4h5l4 2 4-2h5v15h-5l-4 2-4-2H3z',
  history:'M4 5h16M4 12h16M4 19h16M8 3v4m4 3v4m5 3v4',
  link:'M10 14l4-4m-5 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1',
  chat:'M4 4h16v13H9l-5 4zM8 9h8m-8 4h5',
  close:'m6 6 12 12M18 6 6 18',
  send:'m3 4 18 8-18 8 4-8zm4 8h14',
  check:'m4 12 5 5 11-11',
  redo:'M20 10a8 8 0 1 0-2 8m2-14v6h-6',
  draw:'M4 9h16M4 15h16',
  plus:'M12 4v16M4 12h16',
  enter:'M11 4h9v16h-9m-7-8h12m-4-4 4 4-4 4',
  cpu:'M8 8h8v8H8zM5 5h14v14H5zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sound:'M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12',
  mute:'M4 9v6h4l5 4V5L8 9zM17 9l5 6m0-6-5 6'
};
export function icon(name) {
  return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+paths[name]+'"/></svg>';
}
