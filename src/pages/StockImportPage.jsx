import React, { useState, useMemo } from 'react';
import { Truck, FileText, Building2, Package, ChevronRight } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import ImportListView from '../components/stockImport/ImportListView';
import SupplierStepView from '../components/stockImport/SupplierStepView';
import ImportItemsView from '../components/stockImport/ImportItemsView';
import ImportDetailModal from '../components/stockImport/ImportDetailModal';

// ขั้นตอนของหน้านำเข้าสินค้า (3 Page)
const STEPS = [
  { id: 'list', label: 'ใบนำเข้า', icon: FileText },
  { id: 'supplier', label: 'เลือกผู้ผลิต', icon: Building2 },
  { id: 'items', label: 'นำเข้าสินค้า', icon: Package },
];

const EMPTY_DRAFT = {
  id: null,
  import_number: null,
  supplierId: '',
  items: [],
  note: '',
  warehouse_id: 'wh-front',
};

/**
 * หน้านำเข้าสินค้าเข้าคลัง
 * ขั้นตอน: สร้างใบนำเข้า > เลือกผู้ผลิต > นำเข้าสินค้า > รออนุมัติ > ระหว่างขนส่ง > นำเข้าสำเร็จ
 */
export default function StockImportPage() {
  const {
    suppliers = [],
    stockImports = [],
    createStockImport,
    updateStockImport,
    changeStockImportStatus,
  } = usePOS();

  const [step, setStep] = useState('list');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);

  // เก็บเฉพาะ id เพื่อให้ Modal แสดงข้อมูลล่าสุดหลังเปลี่ยนสถานะ
  const [detailImportId, setDetailImportId] = useState(null);
  const detailImport = useMemo(
    () => stockImports.find((imp) => imp.id === detailImportId) || null,
    [stockImports, detailImportId]
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === draft.supplierId) || null,
    [suppliers, draft.supplierId]
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const handleCreateImport = () => {
    setDraft(EMPTY_DRAFT);
    setStep('supplier');
  };

  // เปิดใบนำเข้าที่รออนุมัติเพื่อแก้ไข (เริ่มจากขั้นตอนนำเข้าสินค้า)
  const handleEditImport = (imp) => {
    setDraft({
      id: imp.id,
      import_number: imp.import_number,
      supplierId: imp.supplier_id || '',
      items: imp.items || [],
      note: imp.note || '',
      warehouse_id: imp.warehouse_id || 'wh-front',
    });
    setDetailImportId(null);
    setStep('items');
  };

  const handleBackToList = () => {
    setDraft(EMPTY_DRAFT);
    setStep('list');
  };

  const handleSubmitImport = async (status, enrichedItems) => {
    if (!selectedSupplier || enrichedItems.length === 0) return;
    setSubmitting(true);
    try {
      const payload = {
        supplier: selectedSupplier,
        items: enrichedItems,
        note: draft.note,
        warehouse_id: draft.warehouse_id,
        status,
      };
      const saved = draft.id
        ? await updateStockImport(draft.id, payload)
        : await createStockImport(payload);
      if (saved) {
        handleBackToList();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      {/* แถบหัวข้อเพจ + ขั้นตอน 3 Page */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
              ระบบนำเข้าสินค้าเข้าคลัง (Stock Import)
            </h1>
            <p className="text-xs text-slate-500">
              สร้างใบนำเข้า › เลือกผู้ผลิต › นำเข้าสินค้า › รออนุมัติ › ระหว่างขนส่ง › นำเข้าสำเร็จ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === stepIndex;
            const isDone = idx < stepIndex;
            return (
              <React.Fragment key={s.id}>
                {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap border ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : isDone
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-black/10 flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{s.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {step === 'list' && (
        <ImportListView
          stockImports={stockImports}
          onCreate={handleCreateImport}
          onOpenDetail={(imp) => setDetailImportId(imp.id)}
        />
      )}

      {step === 'supplier' && (
        <SupplierStepView
          suppliers={suppliers}
          selectedSupplierId={draft.supplierId}
          onSelect={(supplierId) => setDraft((prev) => ({ ...prev, supplierId }))}
          onBack={handleBackToList}
          onNext={() => setStep('items')}
        />
      )}

      {step === 'items' && (
        <ImportItemsView
          supplier={selectedSupplier}
          items={draft.items}
          setItems={(updater) =>
            setDraft((prev) => ({
              ...prev,
              items: typeof updater === 'function' ? updater(prev.items) : updater,
            }))
          }
          note={draft.note}
          setNote={(note) => setDraft((prev) => ({ ...prev, note }))}
          warehouseId={draft.warehouse_id}
          setWarehouseId={(warehouse_id) => setDraft((prev) => ({ ...prev, warehouse_id }))}
          importNumber={draft.import_number}
          submitting={submitting}
          onBack={() => setStep('supplier')}
          onSubmit={handleSubmitImport}
        />
      )}

      <ImportDetailModal
        importDoc={detailImport}
        onClose={() => setDetailImportId(null)}
        onEdit={handleEditImport}
        onChangeStatus={(imp, nextStatus) => changeStockImportStatus(imp.id, nextStatus)}
      />
    </div>
  );
}
