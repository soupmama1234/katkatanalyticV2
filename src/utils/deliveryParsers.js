// ── Grab: parse text ที่ extract จาก PDF (pdf.js) ──
function parseGrabText(text) {
  // หา row ตัวเลข 11 คอลัมน์ในตาราง "สรุปข้อมูล"
  // ตัวอย่าง: 468.00 0.00 0.00 0.00 -150.23 -7.50 -10.70 0.00 -30.14 269.43 0.00
  const rowMatch = text.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  const dateMatch = text.match(/(\d{1,2})\s+(กรกฎาคม|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(\d{4})/);

  if (!rowMatch) return { error: 'ไม่พบตารางสรุปข้อมูล', raw: text.slice(0, 500) };

  const THAI_MONTHS = { 'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12 };
  let date = null;
  if (dateMatch) {
    const [, day, monthName, year] = dateMatch;
    const month = String(THAI_MONTHS[monthName]).padStart(2, '0');
    date = `${year}-${month}-${String(day).padStart(2, '0')}`;
  }

  const [, , , , , commission, commissionExtra, marketing, , subsidyAdj] = rowMatch;
  const gp = Math.abs(parseFloat(commission)) + Math.abs(parseFloat(commissionExtra));
  const ads = Math.abs(parseFloat(marketing));
  const subsidy = Math.abs(parseFloat(subsidyAdj));

  const rows = [];
  if (gp > 0) rows.push({ platform: 'grab', category: 'GP Platform', item: 'GP Grab', amount: gp, date });
  if (ads > 0) rows.push({ platform: 'grab', category: 'Ads Platform', item: 'Ads Grab', amount: ads, date });
  if (subsidy > 0) rows.push({ platform: 'grab', category: 'GP Platform', item: 'GP ไทยช่วยไทย Grab', amount: subsidy, date });

  return { rows, date };
}

// ── Lineman: parse text ที่ extract จาก HTML body (strip tags → " | " แล้ว) ──
function parseLinemanHtml(text) {
  const gpMatch  = text.match(/ค่าบริการ GP \(รวม VAT\)[\s|]*(-?[\d.]+)/);
  const discMatch = text.match(/ค่าส่วนลดค่าส่ง \(รวม VAT\)[\s|]*(-?[\d.]+)/);
  // หมายเหตุ: Lineman ใช้ปี พ.ศ. (เช่น 2569) ต่างจาก Grab ที่ใช้ ค.ศ. ตรงๆ — ต้อง -543
  const dateMatch = text.match(/วันที่\s*(\d{1,2})\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+(\d{4})/);

  const THAI_MONTHS_ABBR = { 'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12 };
  let date = null;
  if (dateMatch) {
    const [, day, monthAbbr, buddhistYear] = dateMatch;
    const year = parseInt(buddhistYear, 10) - 543;
    const month = String(THAI_MONTHS_ABBR[monthAbbr]).padStart(2, '0');
    date = `${year}-${month}-${String(day).padStart(2, '0')}`;
  }

  const rows = [];
  if (gpMatch) {
    const gp = Math.abs(parseFloat(gpMatch[1]));
    if (gp > 0) rows.push({ platform: 'lineman', category: 'GP Platform', item: 'GP LINE MAN', amount: gp, date });
  }
  if (discMatch) {
    const disc = Math.abs(parseFloat(discMatch[1]));
    if (disc > 0) rows.push({ platform: 'lineman', category: 'ส่วนลด', item: 'ส่วนลดค่าส่ง LINE MAN', amount: disc, date });
  }
  if (!gpMatch && !discMatch) return { error: 'ไม่พบข้อมูล GP/ส่วนลด', raw: text.slice(0, 500) };

  return { rows, date };
}

// ── Shopee: parse HTML body (decode quoted-printable แล้ว, strip tags แล้ว) ──
function parseShopeeHtml(text) {
  const periodMatch = text.match(/วันที่รายงาน:\s*(\d{4}-\d{2}-\d{2})\s*ถึง\s*(\d{4}-\d{2}-\d{2})/);
  const gpMatch  = text.match(/ค่าธรรมเนียม \(GP\)[\s|]*฿([\d.]+)/);
  const gpVatMatch = text.match(/ยอดภาษีมูลค่าเพิ่มค่าธรรมเนียม[\s|]*฿([\d.]+)/);
  const adsMatch = text.match(/ยอดรวมค่าบริการ Ads Package[\s|]*฿([\d.]+)/);

  if (!periodMatch) return { error: 'ไม่พบช่วงวันที่รายงาน', raw: text.slice(0, 500) };

  const [, periodStart, periodEnd] = periodMatch;
  const gp = (gpMatch ? parseFloat(gpMatch[1]) : 0) + (gpVatMatch ? parseFloat(gpVatMatch[1]) : 0);
  const ads = adsMatch ? parseFloat(adsMatch[1]) : 0;

  const rows = [];
  if (gp > 0) rows.push({ platform: 'shopee', category: 'GP Platform', item: 'GP ShopeeFood', amount: gp, date: periodEnd, report_period_start: periodStart, report_period_end: periodEnd });
  if (ads > 0) rows.push({ platform: 'shopee', category: 'Ads Platform', item: 'Ads ShopeeFood', amount: ads, date: periodEnd, report_period_start: periodStart, report_period_end: periodEnd });

  return { rows, periodStart, periodEnd };
}

export { parseGrabText, parseLinemanHtml, parseShopeeHtml };
