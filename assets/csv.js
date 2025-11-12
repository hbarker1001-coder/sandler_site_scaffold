
function parseCSV(text){
  const rows = [];
  let row = [], col = '', i = 0, inside = false;
  while(i < text.length){
    const c = text[i];
    if(inside){
      if(c === '"'){
        if(text[i+1] === '"'){ col += '"'; i++; } else { inside = false; }
      } else { col += c; }
    } else {
      if(c === '"'){ inside = true; }
      else if(c === ','){ row.push(col); col = ''; }
      else if(c === '\n'){ row.push(col); rows.push(row); row = []; col = ''; }
      else if(c === '\r'){ /* ignore */ }
      else { col += c; }
    }
    i++;
  }
  row.push(col); rows.push(row);
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length && r.some(v => v.trim().length)).map(r => {
    const obj = {}; headers.forEach((h, idx) => obj[h] = (r[idx] ?? '').trim()); return obj;
  });
}
