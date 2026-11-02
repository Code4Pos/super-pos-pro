import thaiAddressTree from './thaiAddressTree.json';

/**
 * รายชื่อจังหวัดทั้งหมดในประเทศไทย (77 จังหวัด) เรียงตามตัวอักษรภาษาไทย
 */
export const THAI_PROVINCES = Object.keys(thaiAddressTree).sort((a, b) =>
  a.localeCompare(b, 'th')
);

/**
 * ตัวเลือกจังหวัดสำหรับ SearchableDropdown
 */
export function getProvinceOptions() {
  return THAI_PROVINCES.map((prov) => ({
    value: prov,
    label: prov,
  }));
}

/**
 * ตัวเลือกอำเภอ/เขต สำหรับ SearchableDropdown
 * - หากเลือกจังหวัดแล้ว จะแสดงเฉพาะอำเภอในจังหวัดนั้น
 * - หากยังไม่เลือกจังหวัด จะแสดงอำเภอทั้งหมดพร้อมบอกจังหวัดด้านหลัง เพื่อให้พิมพ์ค้นหาข้ามจังหวัดได้ทันที
 */
export function getAmphoeOptions(selectedProvince = '') {
  if (selectedProvince && thaiAddressTree[selectedProvince]) {
    const amphoes = Object.keys(thaiAddressTree[selectedProvince]).sort((a, b) =>
      a.localeCompare(b, 'th')
    );
    return amphoes.map((amp) => ({
      value: amp,
      label: amp,
      badge: selectedProvince,
      province: selectedProvince,
    }));
  }

  const allAmphoes = [];
  for (const prov of THAI_PROVINCES) {
    const amphoeMap = thaiAddressTree[prov] || {};
    for (const amp of Object.keys(amphoeMap)) {
      allAmphoes.push({
        value: `${amp}||${prov}`,
        label: amp,
        badge: `จ.${prov}`,
        amphoe: amp,
        province: prov,
      });
    }
  }
  return allAmphoes;
}

/**
 * ตัวเลือกตำบล/แขวง สำหรับ SearchableDropdown
 * - หากเลือกจังหวัดและอำเภอแล้ว จะแสดงตำบลในอำเภอนั้นพร้อมรหัสไปรษณีย์
 * - หากเลือกเฉพาะจังหวัด จะแสดงตำบลทั้งหมดในจังหวัดนั้น
 * - หากยังไม่เลือกอะไรเลย จะแสดงตำบลให้พิมพ์ค้นหาได้พร้อมเติมอำเภอ จังหวัด และรหัสไปรษณีย์อัตโนมัติ
 */
export function getTambonOptions(selectedProvince = '', selectedAmphoe = '') {
  if (
    selectedProvince &&
    selectedAmphoe &&
    thaiAddressTree[selectedProvince]?.[selectedAmphoe]
  ) {
    const list = thaiAddressTree[selectedProvince][selectedAmphoe];
    return list.map(([tambon, zipcode]) => ({
      value: tambon,
      label: tambon,
      badge: zipcode ? `${zipcode}` : '',
      tambon,
      amphoe: selectedAmphoe,
      province: selectedProvince,
      zipcode: zipcode || '',
    }));
  }

  if (selectedProvince && thaiAddressTree[selectedProvince]) {
    const items = [];
    const amphoeMap = thaiAddressTree[selectedProvince];
    for (const [amp, list] of Object.entries(amphoeMap)) {
      for (const [tambon, zipcode] of list) {
        items.push({
          value: `${tambon}||${amp}||${selectedProvince}`,
          label: tambon,
          badge: `อ.${amp} (${zipcode})`,
          tambon,
          amphoe: amp,
          province: selectedProvince,
          zipcode: zipcode || '',
        });
      }
    }
    return items;
  }

  const allItems = [];
  for (const prov of THAI_PROVINCES) {
    const amphoeMap = thaiAddressTree[prov] || {};
    for (const [amp, list] of Object.entries(amphoeMap)) {
      for (const [tambon, zipcode] of list) {
        allItems.push({
          value: `${tambon}||${amp}||${prov}`,
          label: tambon,
          badge: `อ.${amp} จ.${prov} (${zipcode})`,
          tambon,
          amphoe: amp,
          province: prov,
          zipcode: zipcode || '',
        });
      }
    }
  }
  return allItems;
}

/**
 * ค้นหารหัสไปรษณีย์อัตโนมัติจาก จังหวัด + อำเภอ + ตำบล
 */
export function resolvePostalCode(province = '', amphoe = '', tambon = '') {
  if (!province || !thaiAddressTree[province]) return '';
  if (amphoe && thaiAddressTree[province][amphoe]) {
    const list = thaiAddressTree[province][amphoe];
    if (tambon) {
      const found = list.find(([t]) => t === tambon);
      if (found && found[1]) return String(found[1]);
    }
    if (list.length > 0 && list[0][1]) {
      return String(list[0][1]);
    }
  }
  return '';
}

