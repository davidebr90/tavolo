const colors={R:'#e5323b',G:'#14975b',B:'#166acb',Y:'#f4c529'};
const symbols={
  0:'M12 4C7 4 5 8 5 16s2 12 7 12 7-4 7-12S17 4 12 4Z',
  1:'M7 9l6-5v24M7 28h12',
  2:'M5 10c0-8 14-8 14 0 0 5-8 9-14 18h14',
  3:'M5 5h14l-8 10c6-2 10 1 9 6-1 8-11 9-16 4',
  4:'M15 28V4L4 21h16',
  5:'M19 5H6l-1 11c6-3 15-2 15 5s-10 10-16 5',
  6:'M18 5C6 0 4 11 4 19c0 12 16 12 16 1 0-8-10-10-15-4',
  7:'M4 5h16L9 28',
  8:'M12 4c-10 0-10 11 0 12 11 1 10 13 0 13S1 17 12 16c10-1 10-12 0-12Z',
  9:'M6 28c12 5 14-6 14-14C20 2 4 2 4 13c0 8 10 10 15 4',
  S:'M12 6a10 10 0 1 1 0 20 10 10 0 1 1 0-20ZM5 23 19 9',
  R:'M3 12h16l-5-5m7 13H5l5 5',
  A2:'M1 16h9m-4-5v10m8-11c0-6 9-6 9 0 0 4-5 7-9 12h9',
  W4:'M1 16h9m-4-5v10m14 3V8l-8 12h12'
};
const mark=(value,ink)=>'<path d="'+symbols[value]+'" fill="none" stroke="'+ink+'" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';
const corner=(value,ink)=>value==='WC'
  ? '<path fill="#fff" d="M3 16a9 9 0 1 0 18 0 9 9 0 1 0-18 0"/><path fill="#e5323b" d="M12 8a8 8 0 0 0-8 8h8Z"/><path fill="#166acb" d="M12 24a8 8 0 0 0 8-8h-8Z"/>'
  : mark(value,ink);
function face(color,value) {
  const ink=color==='Y'?'#282017':'#fff';
  const fill=colors[color]??'#181a21';
  const center=value==='WC'?
    '<g transform="translate(50 75) rotate(33)"><path fill="#e5323b" d="M0 0v-47a30 47 0 0 0-30 47Z"/><path fill="#166acb" d="M0 0h30a30 47 0 0 0-30-47Z"/><path fill="#14975b" d="M0 0v47a30 47 0 0 0 30-47Z"/><path fill="#f4c529" d="M0 0h-30a30 47 0 0 0 30 47Z"/></g>':
    value==='W4'?'<g transform="rotate(16 50 75)">'+Object.values(colors).map((shade,i)=>'<rect x="'+(27+i*9)+'" y="'+(71-i*8)+'" width="20" height="29" rx="3" fill="'+shade+'" stroke="#fff" stroke-width="2"/>').join('')+'</g>':
    '<g transform="translate(27 44) scale(1.9)">'+mark(value,color==='Y'?'#4b3600':fill)+'</g>';
  return [100,150,'<rect x="1" y="1" width="98" height="148" rx="10" fill="#fff" stroke="#a09b91"/>'+
    '<rect x="6" y="6" width="88" height="138" rx="7" fill="'+fill+'"/>'+
    '<ellipse cx="50" cy="75" rx="31" ry="49" transform="rotate(33 50 75)" fill="#fff"/>'+center+
    '<g transform="translate(9 9) scale(.65)">'+corner(value,ink)+'</g>'+
    '<g transform="translate(91 141) rotate(180) scale(.65)">'+corner(value,ink)+'</g>'];
}
const ranks=['0','1','2','3','4','5','6','7','8','9','S','R','A2'];
export default Object.fromEntries([
  ...Object.keys(colors).flatMap(c=>ranks.map(r=>[c+r,face(c,r)])),
  ...['WC','W4'].map(r=>[r,face('W',r)])
]);
