const layouts=new Map();

function narrowSpot(place,total) {
  // Distribute opponents along both long sides and the head of a portrait table.
  const height=1.5, start=height/2, side=start+height;
  const distance=(place-1)/(total-2)*(2*side+2);
  if(distance<=side)return {x:-1,y:(start-distance)/height};
  if(distance<=side+2)return {x:distance-side-1,y:-1};
  return {x:1,y:(distance-side-2-height)/height};
}

// Coordinates are relative to the viewer. Every hand at the same capacity
// reuses these positions; CSS chooses the portrait layout at the table's width.
export function seatPositions(total) {
  if(!layouts.has(total)) {
    const span=total<=4?270:300;
    const positions=Array.from({length:total},(_,place)=>{
      const angle=(270-span/2+span*place/total)*Math.PI/180;
      const x=place?Math.cos(angle):0, y=place?Math.sin(angle):1;
      const narrow=place&&total>5?narrowSpot(place,total):{x,y};
      const style='--x:'+x.toFixed(3)+';--y:'+y.toFixed(3)+';--nx:'+narrow.x.toFixed(3)+';--ny:'+narrow.y.toFixed(3);
      return {x,y,onAxis:Math.abs(x)<.01,style};
    });
    layouts.set(total,positions);
  }
  return layouts.get(total);
}
