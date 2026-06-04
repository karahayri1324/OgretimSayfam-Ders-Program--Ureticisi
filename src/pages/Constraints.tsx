import { useEffect, useState } from 'react';
import { ShieldAlert, Trash2, Sparkles, Hand } from 'lucide-react';
import { tr } from '../lib/i18n';
import { useConstraintsStore } from '../store/constraints';
import { useToastStore } from '../store/toast';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import {
  constraintTypeLabel,
  formatConstraint,
} from '../lib/formatConstraint';
import type { Constraint } from '../lib/types';

export default function Constraints() {
  const {
    constraints,
    load,
    loading,
    toggleConstraint,
    deleteConstraint,
    setWeight,
  } = useConstraintsStore();
  const toast = useToastStore();

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(c: Constraint) {
    if (!window.confirm(tr.constraints.deleteConfirm)) return;
    await deleteConstraint(c.id);
    toast.success(tr.common.deleted);
  }

  async function handleWeightChange(c: Constraint, weight: number) {
    await setWeight(c.id, weight);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">
          {tr.constraints.title}{' '}
          <span className="text-ink-400">({constraints.length})</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          {tr.constraints.description}
        </p>
      </header>

      {loading && constraints.length === 0 ? (
        <Spinner block />
      ) : constraints.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Henüz kısıtlama yok"
          description={tr.constraints.empty}
        />
      ) : (
        <ul className="space-y-3">
          {constraints.map((c) => (
            <ConstraintItem
              key={c.id}
              c={c}
              onToggle={(active) => toggleConstraint(c.id, active)}
              onDelete={() => handleDelete(c)}
              onWeight={(w) => handleWeightChange(c, w)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ConstraintItem({
  c,
  onToggle,
  onDelete,
  onWeight,
}: {
  c: Constraint;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
  onWeight: (weight: number) => void;
}) {
  const [weight, setWeight] = useState(c.weight);

  return (
    <Card>
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={c.weight >= 100 ? 'err' : 'primary'}>
              {constraintTypeLabel(c.type)}
            </Badge>
            <Badge variant={c.source === 'ai' ? 'ok' : 'neutral'}>
              {c.source === 'ai' ? (
                <>
                  <Sparkles size={10} /> {tr.constraints.source.ai}
                </>
              ) : (
                <>
                  <Hand size={10} /> {tr.constraints.source.manual}
                </>
              )}
            </Badge>
            {!c.active && <Badge variant="warn">Pasif</Badge>}
          </div>
          <p className="text-sm text-ink-800">{formatConstraint(c)}</p>
          {c.notes && <p className="text-xs text-ink-500">{c.notes}</p>}
          <div className="flex items-center gap-3 pt-1">
            <Label htmlFor={`w-${c.id}`}>
              {tr.constraints.weight}: {weight}
            </Label>
            <input
              id={`w-${c.id}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              onMouseUp={() => onWeight(weight)}
              onTouchEnd={() => onWeight(weight)}
              onKeyUp={() => onWeight(weight)}
              onBlur={() => onWeight(weight)}
              className="w-56 accent-primary-500"
            />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-xs text-ink-600">
            <span>{tr.constraints.active}</span>
            <Switch
              checked={c.active}
              onChange={onToggle}
              ariaLabel={tr.constraints.active}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-accent-err hover:bg-red-50"
            aria-label={tr.common.delete}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
