import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TrackedFlight } from '../types/flight';
import type { FlightSortMode } from '../types/settings';
import { FlightCard } from './FlightCard';
import { EmptyState } from './EmptyState';
import { cn } from '../utils/classNames';

interface DashboardProps {
  flights: TrackedFlight[];
  duplicateFlashId: string | null;
  sortMode: FlightSortMode;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onResetToAutoSort: () => void;
}

export function Dashboard({
  flights,
  duplicateFlashId,
  sortMode,
  onRefresh,
  onRemove,
  onReorder,
  onResetToAutoSort,
}: DashboardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (flights.length === 0) return <EmptyState />;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    onReorder(String(active.id), String(over.id));
  }

  return (
    <div>
      {sortMode === 'manual' && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <span>Custom order — drag cards to rearrange.</span>
          <button
            type="button"
            onClick={onResetToAutoSort}
            className="min-h-[36px] rounded-md px-2 font-semibold underline-offset-2 hover:underline"
          >
            Reset to auto-sort
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={flights.map((f) => f.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {flights.map((flight) => (
              <SortableFlightCard
                key={flight.id}
                flight={flight}
                onRefresh={onRefresh}
                onRemove={onRemove}
                isDuplicateFlash={duplicateFlashId === flight.id}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortableFlightCardProps {
  flight: TrackedFlight;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  isDuplicateFlash: boolean;
}

function SortableFlightCard({ flight, onRefresh, onRemove, isDuplicateFlash }: SortableFlightCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: flight.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'z-10 opacity-70')}>
      <FlightCard
        flight={flight}
        onRefresh={onRefresh}
        onRemove={onRemove}
        isDuplicateFlash={isDuplicateFlash}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}
