import React, { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  Users,
  Store,
  Phone,
  MapPin,
  Award,
  ShoppingCart,
  Edit3,
  X,
  Save,
  Wallet,
  Ban,
  Landmark,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { formatCurrency, formatNumber } from '../utils/formatters';
import CustomerPaymentModal from '../components/customers/CustomerPaymentModal';
import {
  B2B_CUSTOMER_DEFAULTS,
  CREDIT_TERM_OPTIONS,
  isValidThaiTaxId,
  formatBranchLabel,
} from '../utils/credit';

const DEFAULT_CUSTOMER_FORM = {
  id: null,
  code: '',
  name: '',
  phone: '',
  customer_type: 'wholesale',
  special_price_tier: 0,
  shop_name: '',
  address: '',
  ...B2B_CUSTOMER_DEFAULTS,
};

export default function CustomersPage({ onNavigateToPOS }) {
  const { customers, saveCustomer, selectCustomer, getCustomerCredit, showToast, can } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'wholesale' | 'retail' | 'outstanding'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_CUSTOMER_FORM);
  const [saving, setSaving] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState(null);

  // สรุปเครดิตของลูกค้าทุกราย (ยอดค้าง / เกินกำหนด / วงเงินคงเหลือ)
  const creditByCustomerId = useMemo(() => {
    const map = new Map();
    customers.forEach((c) => map.set(c.id, getCustomerCredit(c)));
    return map;
  }, [customers, getCustomerCredit]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return customers.filter((c) => {
      if (typeFilter === 'outstanding') {
        if (!(creditByCustomerId.get(c.id)?.outstanding > 0)) return false;
      } else if (typeFilter !== 'all' && c.customer_type !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.shop_name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        (qDigits.length > 0 && c.tax_id?.includes(qDigits))
      );
    });
  }, [customers, searchQuery, typeFilter, creditByCustomerId]);

  const handleOpenAdd = () => {
    const rand = Math.floor(100 + Math.random() * 900);
    setForm({
      ...DEFAULT_CUSTOMER_FORM,
      code: `CUS-${rand}`,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cus) => {
    setForm({
      id: cus.id,
      code: cus.code || '',
      name: cus.name || '',
      phone: cus.phone || '',
      customer_type: cus.customer_type || 'retail',
      special_price_tier: Number(cus.special_price_tier) || 0,
      shop_name: cus.shop_name || '',
      address: cus.address || '',
      tax_id: cus.tax_id || '',
      branch_number: cus.branch_number || '00000',
      credit_limit: Number(cus.credit_limit) || 0,
      credit_term_days: Number(cus.credit_term_days) || 0,
      is_blocked: Boolean(cus.is_blocked),
    });
    setIsModalOpen(true);
  };

  const taxIdEntered = String(form.tax_id || '').replace(/\D/g, '');
  const taxIdInvalid = taxIdEntered.length > 0 && !isValidThaiTaxId(taxIdEntered);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (taxIdInvalid) {
      showToast('เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ต้องเป็น 13 หลักและผ่านการตรวจหลักสุดท้าย)', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveCustomer(form);
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleStartOrderForCustomer = (cus) => {
    selectCustomer(cus);
    if (onNavigateToPOS) onNavigateToPOS(cus);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-8 space-y-5">
      {/* แถบค้นหาและปุ่มเพิ่มลูกค้า */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, ชื่อร้าน, เบอร์โทร, รหัสสมาชิก หรือเลขผู้เสียภาษี..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'wholesale', label: '⭐ ลูกค้าส่ง / ยี่ปั๊ว' },
              { id: 'retail', label: 'ลูกค้าปลีก' },
              { id: 'outstanding', label: 'มียอดค้างชำระ' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  typeFilter === t.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>เพิ่มลูกค้าใหม่</span>
          </button>
        </div>
      </div>

      {/* การ์ดแสดงรายชื่อลูกค้า */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCustomers.map((cus) => {
          const isWholesale = cus.customer_type === 'wholesale';
          const credit = creditByCustomerId.get(cus.id);
          const creditLimit = Number(cus.credit_limit) || 0;
          const hasCreditInfo = creditLimit > 0 || credit?.outstanding > 0;
          const usagePct =
            creditLimit > 0 ? Math.min(100, Math.round((credit.outstanding / creditLimit) * 100)) : 0;
          return (
            <div
              key={cus.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-slate-400">
                        {cus.code}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isWholesale
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        }`}
                      >
                        {isWholesale
                          ? '⭐ ลูกค้าขายส่ง'
                          : 'ลูกค้าขายปลีกทั่วไป'}
                      </span>
                      {(Number(cus.special_price_tier) || 0) > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          ราคาพิเศษ ขั้นที่ {cus.special_price_tier}
                        </span>
                      )}
                      {cus.is_blocked && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          <Ban className="w-3 h-3" />
                          ระงับขายเชื่อ
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-base mt-1">
                      {cus.name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(cus)}
                    className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                    title="แก้ไขข้อมูลลูกค้า"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  {cus.shop_name && cus.shop_name !== '-' && (
                    <div className="flex items-center gap-2">
                      <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800">
                        {cus.shop_name}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{cus.phone || 'ไม่ได้ระบุเบอร์โทร'}</span>
                  </div>
                  {cus.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{cus.address}</span>
                    </div>
                  )}
                  {cus.tax_id && (
                    <div className="flex items-center gap-2">
                      <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono">
                        {cus.tax_id} ({formatBranchLabel(cus.branch_number)})
                      </span>
                    </div>
                  )}
                </div>

                {/* สถานะเครดิต: ยอดค้าง / วงเงิน / เกินกำหนด */}
                {hasCreditInfo && (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        ค้างชำระ (เครดิต {Number(cus.credit_term_days) || 0} วัน)
                      </span>
                      <span className="font-extrabold text-rose-600">
                        {formatCurrency(credit.outstanding)}
                        {creditLimit > 0 && (
                          <span className="text-slate-400 font-semibold">
                            {' '}
                            / {formatCurrency(creditLimit, false)}
                          </span>
                        )}
                      </span>
                    </div>
                    {creditLimit > 0 && (
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            usagePct >= 90 ? 'bg-rose-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                    )}
                    {credit.overdue > 0 && (
                      <div className="font-bold text-amber-700">
                        เกินกำหนดชำระ {formatCurrency(credit.overdue)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-2.5 rounded-xl">
                  <div>
                    <div className="text-[10px] text-slate-400">ยอดซื้อสะสม</div>
                    <div className="text-xs font-extrabold text-slate-900 mt-0.5">
                      {formatCurrency(cus.total_spent, false)}
                    </div>
                  </div>
                  <div className="border-x border-slate-200">
                    <div className="text-[10px] text-slate-400">จำนวนบิล</div>
                    <div className="text-xs font-extrabold text-indigo-600 mt-0.5">
                      {formatNumber(cus.order_count)} ครั้ง
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">แต้มสะสม</div>
                    <div className="text-xs font-extrabold text-amber-600 mt-0.5">
                      {formatNumber(cus.points)} แต้ม
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartOrderForCustomer(cus)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>เปิดบิลขาย</span>
                  </button>
                  {credit?.outstanding > 0 && can('receive_payment') && (
                    <button
                      type="button"
                      onClick={() => setPaymentCustomer(cus)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>รับชำระหนี้</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal เพิ่ม/แก้ไขลูกค้า */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-base">
                {form.id ? 'แก้ไขข้อมูลลูกค้า' : 'ลงทะเบียนลูกค้า / ยี่ปั๊วใหม่'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ประเภทลูกค้า (มีผลต่อการคิดเรตราคา)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: 'wholesale',
                      title: '⭐ ลูกค้าขายส่ง / ยี่ปั๊ว',
                      desc: 'ได้เรตราคาส่งทันทีทุกชิ้น',
                    },
                    {
                      id: 'retail',
                      title: '👤 ลูกค้าทั่วไป',
                      desc: 'คิดราคาปลีก-ส่งตามจำนวน',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setForm({ ...form, customer_type: opt.id })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        form.customer_type === opt.id
                          ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/15'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">
                        {opt.title}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสลูกค้า
                  </label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อ-นามสกุล / ชื่อเรียก *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="เช่น เจ๊พร มินิมาร์ท"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="08X-XXX-XXXX"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อร้านค้า / กิจการ
                  </label>
                  <input
                    type="text"
                    value={form.shop_name}
                    onChange={(e) =>
                      setForm({ ...form, shop_name: e.target.value })
                    }
                    placeholder="ระบุชื่อร้านย่อย (ถ้ามี)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  สิทธิราคาพิเศษ (ขั้นที่ 1 - 10)
                </label>
                <select
                  value={form.special_price_tier ?? 0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      special_price_tier: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/40 text-xs font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value={0}>ไม่มีสิทธิราคาพิเศษ (ใช้ราคาปลีก/ส่งปกติ)</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((tierNum) => (
                    <option key={tierNum} value={tierNum}>
                      สิทธิราคาพิเศษ ขั้นที่ {tierNum}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ที่อยู่จัดส่ง / โซนร้านค้า
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="ระบุที่อยู่หรือจุดสังเกต..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              {/* ข้อมูลนิติบุคคล (ใบกำกับภาษีเต็มรูป) และเงื่อนไขเครดิต */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-extrabold text-slate-700">
                  ข้อมูลนิติบุคคล & เงื่อนไขเครดิต (B2B)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      เลขประจำตัวผู้เสียภาษี 13 หลัก
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={17}
                      value={form.tax_id}
                      onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                      placeholder="ไม่บังคับ"
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                        taxIdInvalid ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      รหัสสาขา
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={form.branch_number}
                      onChange={(e) => setForm({ ...form, branch_number: e.target.value })}
                      placeholder="00000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>
                {taxIdInvalid && (
                  <p className="text-[11px] font-bold text-rose-600 -mt-1.5">
                    เลขผู้เสียภาษีไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)
                  </p>
                )}
                <p className="text-[10px] text-slate-500 -mt-1.5">
                  รหัสสาขา 00000 = สำนักงานใหญ่
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      วงเงินเครดิต (บาท, 0 = ไม่จำกัด)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={form.credit_limit}
                      onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      เครดิตเทอม
                    </label>
                    <select
                      value={form.credit_term_days}
                      onChange={(e) =>
                        setForm({ ...form, credit_term_days: Number(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                    >
                      {CREDIT_TERM_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? 'ไม่มีเครดิตเทอม (ครบกำหนดทันที)' : `${d} วัน`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5" />
                    ระงับการขายเชื่อลูกค้ารายนี้
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_blocked)}
                    onChange={(e) => setForm({ ...form, is_blocked: e.target.checked })}
                    className="w-4 h-4 accent-rose-600"
                  />
                </label>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Save className="w-4 h-4" />
                  <span>บันทึกข้อมูลลูกค้า</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CustomerPaymentModal customer={paymentCustomer} onClose={() => setPaymentCustomer(null)} />
    </div>
  );
}

