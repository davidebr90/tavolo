// Ship geometry for the Battaglia navale setup. Pure functions shared by the UI and the tests.

// Cells covered by a ship from its top-left cell. A cell outside the grid is -1.
export function shipTiles(ship,length,size) {
  return Array.from({length},(_,n)=>{
    const row=Math.floor(ship.at/size)+(ship.vertical?n:0), col=ship.at%size+(ship.vertical?0:n);
    return row<size&&col<size?row*size+col:-1;
  });
}

// Cells ordered from bow (sector 1) to stern.
export function shipSectors(ship,length,size) {
  const cells=shipTiles(ship,length,size);
  return ship.reversed?cells.reverse():cells;
}

const distance=(a,b,size)=>Math.abs(a%size-b%size)+Math.abs(Math.floor(a/size)-Math.floor(b/size));

// Turns a placed ship a quarter turn. The clicked sector is tried first, then the nearest
// sectors, then the opposite direction. Returns null only when no quarter turn fits.
export function rotateShip(ships,lengths,index,pivot,dir,size) {
  const ship=ships[index];
  if(!ship)return null;
  const own=shipSectors(ship,lengths[index],size);
  const occupied=new Set(ships.flatMap((other,i)=>i===index||!other?[]:shipTiles(other,lengths[i],size)));
  const pivots=own.slice().sort((a,b)=>distance(a,pivot,size)-distance(b,pivot,size));
  for(const turn of [dir,-dir]) for(const center of pivots) {
    const x=center%size, y=Math.floor(center/size);
    const points=own.map(at=>{
      const col=x-turn*(Math.floor(at/size)-y), row=y+turn*(at%size-x);
      return col<0||row<0||col>=size||row>=size?-1:row*size+col;
    });
    if(points.every(at=>at>=0&&!occupied.has(at)))
      return {ship:{at:Math.min(...points),vertical:!ship.vertical,reversed:points[0]>points.at(-1)},pivot:center};
  }
  return null;
}
