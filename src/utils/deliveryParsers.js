// ── Grab: parse text ที่ extract จาก PDF (pdf.js) ──
function parseGrabText(text) {
  // หา row ตัวเลข 11 คอลัมน์ในตาราง "สรุปข้อมูล"
  // ตัวอย่าง: 468.00 0.00 0.00 0.00 -150.23 -7.50 -10.70 0.00 -30.14 269.43 0.00
  // Grab's PDF font เข้ารหัสวรรณยุกต์บางตัวเป็น Private Use Area (ไม่ใช่ Unicode ไทยมาตรฐาน)
  // และบางคำถูกตัดกลางคำด้วย \n (line wrap ในตาราง) — normalize ตัดวรรณยุกต์(ทั้ง 2 แบบ)/ช่องว่างออกก่อนเทียบ
  const normalize = (s) => s.replace(/[\u0E48-\u0E4B\uF700-\uF7FF]/g, '').replace(/\s+/g, '');

  const headerIdx = text.search(/รายการ\s*VAT/);
  if (headerIdx === -1) return { error: 'ไม่พบหัวตารางสรุปข้อมูล', raw: text.slice(0, 500) };
  const afterHeader = text.slice(headerIdx);

  // ตัวเลขติดกันไม่มีช่องว่าง เช่น 468.000.000.000.00-150.23-7.50-10.700.00-30.14269.430.00
  const blobMatch = afterHeader.match(/(?:-?\d+\.\d{2}){8,}/);
  if (!blobMatch) return { error: 'ไม่พบแถวตัวเลขในตารางสรุปข้อมูล', raw: text.slice(0, 500) };

  const headerBlock = normalize(afterHeader.slice(0, blobMatch.index));
  const hasCommissionExtra = headerBlock.includes(normalize('ค่าคอมมิชชั่นเพิ่มเติม'));
  const hasAds = headerBlock.includes(normalize('ค่าธรรมเนียมการตลาด'));
  // "การปรับรายได้" มี 2 แบบที่ขึ้นต้นเหมือนกัน: ตัวเดี่ยว (ปรับรายได้ทั่วไป เช่น refund) กับ
  // "การปรับรายได้(ค่าคอมมิชชันไทยช่วยไทยพลัส)*" — แยกด้วยว่ามีวงเล็บต่อท้ายทันทีไหม
  const hasSubsidyAdj = headerBlock.includes(normalize('การปรับรายได้') + '(');
  const adjustmentCount = (headerBlock.match(new RegExp(normalize('การปรับรายได้'), 'g')) || []).length;
  const hasGenericAdjustment = adjustmentCount > (hasSubsidyAdj ? 1 : 0);

  const numbers = blobMatch[0].match(/-?\d+\.\d{2}/g);
  let i = 0;
  i++; // ยอดรายการ — ไม่ใช้ในการคำนวณ
  i++; // VAT — ไม่ใช้ในการคำนวณ
  i++; // ค่าบริการร้าน — ไม่ใช้ในการคำนวณ
  const promotion = numbers[i++]; // โปรโมชั่นร้าน
  const commission = numbers[i++];
  const commissionExtra = hasCommissionExtra ? numbers[i++] : '0.00';
  const marketing = hasAds ? numbers[i++] : '0.00';
  i++; // ส่วนลดค่าจัดส่งโดยร้าน — ไม่ใช้ในการคำนวณ
  const genericAdjustment = hasGenericAdjustment ? numbers[i++] : '0.00';
  const subsidyAdj = hasSubsidyAdj ? numbers[i++] : '0.00';

  const dateMatch = text.match(/(\d{1,2})\s+(กรกฎาคม|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(\d{4})/);

  const THAI_MONTHS = { 'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12 };
  let date = null;
  if (dateMatch) {
    const [, day, monthName, year] = dateMatch;
    const month = String(THAI_MONTHS[monthName]).padStart(2, '0');
    date = `${year}-${month}-${String(day).padStart(2, '0')}`;
  }
  if (!date) return { error: 'ไม่พบวันที่ในอีเมล', raw: text.slice(0, 500) };

  const round2 = (n) => Math.round(n * 100) / 100;
  const gp = round2(Math.abs(parseFloat(commission)) + Math.abs(parseFloat(commissionExtra)));
  const ads = round2(Math.abs(parseFloat(marketing)));
  const promo = round2(Math.abs(parseFloat(promotion)));
  // รวมค่า "ปรับรายได้" ทั้ง 2 แบบ โดยคงเครื่องหมายบวก/ลบเดิมก่อนรวม (สำคัญ! ถ้า Math.abs ทีละตัวก่อนจะผิด
  // เช่น +48.00 กับ -76.37 ต้องรวมเป็น -28.37 ก่อน แล้วค่อย Math.abs ทีเดียว ไม่ใช่บวกค่า absolute กัน)
  const netSubsidyAdjustment = parseFloat(genericAdjustment) + parseFloat(subsidyAdj);
  const subsidy = round2(Math.abs(netSubsidyAdjustment));

  const rows = [];
  if (gp > 0) rows.push({ platform: 'grab', category: 'GP Platform', item: 'GP Grab', amount: gp, date, sync_key: `grab:${date}:gp` });
  if (ads > 0) rows.push({ platform: 'grab', category: 'Ads Platform', item: 'Ads Grab', amount: ads, date, sync_key: `grab:${date}:ads` });
  if (subsidy > 0) rows.push({ platform: 'grab', category: 'GP Platform', item: 'GP ไทยช่วยไทย Grab', amount: subsidy, date, sync_key: `grab:${date}:gp_subsidy` });
  if (promo > 0) rows.push({ platform: 'grab', category: 'ส่วนลด', item: 'โปรโมชั่นร้าน Grab', amount: promo, date, sync_key: `grab:${date}:promo` });

  return { rows, date };
}

// ── Lineman: parse text ที่ extract จาก HTML body (แปลง <br>/<p> เป็น \n ก่อนแล้ว) ──
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
  if (!date) return { error: 'ไม่พบวันที่ในอีเมล', raw: text.slice(0, 500) };

  const rows = [];
  if (gpMatch) {
    const gp = Math.abs(parseFloat(gpMatch[1]));
    if (gp > 0) rows.push({ platform: 'lineman', category: 'GP Platform', item: 'GP LINE MAN', amount: gp, date, sync_key: `lineman:${date}:gp` });
  }
  if (discMatch) {
    const disc = Math.abs(parseFloat(discMatch[1]));
    if (disc > 0) rows.push({ platform: 'lineman', category: 'Ads Platform', item: 'ส่วนลดค่าส่ง LINE MAN', amount: disc, date, sync_key: `lineman:${date}:ads` });
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

  const periodKey = `${periodStart}_${periodEnd}`;
  const rows = [];
  if (gp > 0) rows.push({ platform: 'shopee', category: 'GP Platform', item: 'GP ShopeeFood', amount: gp, date: periodEnd, report_period_start: periodStart, report_period_end: periodEnd, sync_key: `shopee:${periodKey}:gp` });
  if (ads > 0) rows.push({ platform: 'shopee', category: 'Ads Platform', item: 'Ads ShopeeFood', amount: ads, date: periodEnd, report_period_start: periodStart, report_period_end: periodEnd, sync_key: `shopee:${periodKey}:ads` });

  return { rows, periodStart, periodEnd };
}

export { parseGrabText, parseLinemanHtml, parseShopeeHtml };
