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
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { formatCurrency, formatNumber } from '../utils/formatters';

const DEFAULT_CUSTOMER_FORM = {
  id: null,
  code: '',
  name: '',
  phone: '',
  customer_type: 'wholesale',
  shop_name: '',
  address: '',
};

export default function CustomersPage({ onNavigateToPOS }) {
  const { customers, saveCustomer, selectCustomer } = usePOS();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'wholesale' | 'retail'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_CUSTOMER_FORM);
  const [saving, setSaving] = useState(false);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      if (typeFilter !== 'all' && c.customer_type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.shop_name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q)
      );
    });
  }, [customers, searchQuery, typeFilter]);

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
      shop_name: cus.shop_name || '',
      address: cus.address || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
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
    if (onNavigateToPOS) onNavigateToPOS();
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
            placeholder="ค้นหาชื่อลูกค้า, ชื่อร้านค้าย่อย, เบอร์โทรศัพท์ หรือรหัสสมาชิก..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'wholesale', label: '⭐ ลูกค้าส่ง / ยี่ปั๊ว' },
              { id: 'retail', label: 'ลูกค้าปลีก' },
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
          return (
            <div
              key={cus.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
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
                          ? '⭐ ลูกค้าขายส่ง (ได้เรตราคาส่งทันที)'
                          : 'ลูกค้าขายปลีกทั่วไป'}
                      </span>
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
                </div>
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

                <button
                  type="button"
                  onClick={() => handleStartOrderForCustomer(cus)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>เลือกเปิดบิลขายให้ลูกค้านี้</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal เพิ่ม/แก้ไขลูกค้า */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
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

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
    </div>
  );
}

