import { useEffect, useState } from 'react';
import { DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { tr } from '../lib/i18n';
import { useRoomsStore } from '../store/rooms';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Input, Label, Textarea } from '../components/ui/Input';
import { Table, type Column } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import type { Room, RoomInput } from '../lib/types';

export default function Rooms() {
  const { rooms, load, create, update, remove, loading } = useRoomsStore();
  const toast = useToastStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(r: Room) {
    setEditing(r);
    setDialogOpen(true);
  }

  async function handleDelete(r: Room) {
    if (!window.confirm(tr.rooms.deleteConfirm)) return;
    const ok = await remove(r.id);
    if (ok) toast.success(tr.common.deleted, r.name);
    else toast.error(tr.common.error);
  }

  const columns: Column<Room>[] = [
    {
      key: 'name',
      header: tr.common.name,
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
    },
    {
      key: 'building',
      header: tr.rooms.building,
      width: '160px',
      cell: (r) =>
        r.building ? r.building : <span className="text-ink-400">—</span>,
    },
    {
      key: 'notes',
      header: tr.common.notes,
      cell: (r) =>
        r.notes ? r.notes : <span className="text-ink-400">—</span>,
    },
    {
      key: 'actions',
      header: tr.common.actions,
      width: '140px',
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openEdit(r)}
            aria-label={tr.common.edit}
          >
            <Pencil size={14} />
            {tr.common.edit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDelete(r)}
            aria-label={tr.common.delete}
            className="text-accent-err hover:bg-red-50"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            {tr.rooms.title}{' '}
            <span className="text-ink-400">({rooms.length})</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            <strong>Derslik = fiziksel oda.</strong> Örnek: 101 numaralı sınıf,
            Lab1, Spor Salonu, Resim Atölyesi. Bir sınıf farklı derslerde
            farklı dersliklerde ders görebilir (matematik 101'de, fizik
            Lab1'de gibi).
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          {tr.rooms.addNew}
        </Button>
      </header>

      {loading && rooms.length === 0 ? (
        <Spinner block />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={tr.rooms.empty}
          description={tr.rooms.emptyHint}
          action={
            <Button onClick={openCreate}>
              <Plus size={16} />
              {tr.rooms.addNew}
            </Button>
          }
        />
      ) : (
        <Table columns={columns} rows={rooms} getRowKey={(r) => r.id} />
      )}

      <RoomDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        room={editing}
        onSubmit={async (input) => {
          const ok = editing
            ? await update(editing.id, input)
            : await create(input);
          if (ok) {
            toast.success(tr.common.saved, input.name);
            setDialogOpen(false);
          } else {
            toast.error(tr.common.error);
          }
        }}
      />
    </div>
  );
}

function RoomDialog({
  open,
  onClose,
  room,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  room: Room | null;
  onSubmit: (input: RoomInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(room?.name ?? '');
      setBuilding(room?.building ?? '');
      setNotes(room?.notes ?? '');
    }
  }, [open, room]);

  const parsedNames = room
    ? [name.trim()].filter(Boolean)
    : name
        .split(/[,;\n]/)
        .map((n) => n.trim())
        .filter(Boolean);

  async function submit() {
    if (parsedNames.length === 0) return;
    setSubmitting(true);
    for (const n of parsedNames) {
      await onSubmit({
        // Düzenleme modunda mevcut kapasiteyi KORU; her kayıtta 30'a sıfırlamak AI ile veya
        // elle ayarlanmış kapasiteyi (dersliğin adını/binasını düzeltince) sessizce siliyordu.
        // Yeni derslik(ler) için makul varsayılan 30.
        name: n,
        capacity: room?.capacity ?? 30,
        building: building.trim() || null,
        notes: notes.trim() || null,
      });
    }
    setSubmitting(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={room ? tr.rooms.edit : tr.rooms.addNew}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button onClick={submit} disabled={submitting || parsedNames.length === 0}>
            {parsedNames.length > 1
              ? `${parsedNames.length} derslik ekle`
              : tr.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="room-name">
            {room ? 'Derslik adı' : 'Derslik adı (virgülle birden fazla)'}
          </Label>
          <Input
            id="room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={room ? 'A-101' : '101, 102, 103, Lab1, Spor Salonu'}
            autoFocus
          />
          {!room && (
            <p className="mt-1 text-xs text-ink-500">
              💡 Virgülle ayırarak birden fazla derslik hızla ekleyebilirsin.
            </p>
          )}
          {!room && parsedNames.length > 1 && (
            <p className="mt-2 text-xs text-primary-700">
              Eklenecek: {parsedNames.map((n) => `"${n}"`).join(', ')}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="room-building">
            {tr.rooms.building}{' '}
            <span className="text-ink-400">{tr.common.optional}</span>
          </Label>
          <Input
            id="room-building"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            placeholder="Ana Bina"
          />
        </div>
        <div>
          <Label htmlFor="room-notes">{tr.common.notes}</Label>
          <Textarea
            id="room-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
