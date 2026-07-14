import { Edit2, Trash2, FileText, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface ActionButtonProps {
    onClick: (e: React.MouseEvent) => void;
    icon: LucideIcon;
    colorClass: string;
    hoverClass: string;
    title?: string;
}

const ActionButton = ({ onClick, icon: Icon, colorClass, hoverClass, title }: ActionButtonProps) => (
    <button
        type="button"
        onClick={(e) => {
            e.stopPropagation();
            onClick(e);
        }}
        className={clsx(
            "p-1 transition-colors rounded",
            colorClass,
            hoverClass,
            "hover:bg-slate-100"
        )}
        title={title}
    >
        <Icon className="h-4 w-4" />
    </button>
);

interface ActionButtonsProps {
    onView?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    customActions?: React.ReactNode;
    viewTitle?: string;
    editTitle?: string;
    deleteTitle?: string;
}

export const ActionButtons = ({
    onView,
    onEdit,
    onDelete,
    customActions,
    viewTitle = "Szczegóły",
    editTitle = "Edytuj",
    deleteTitle = "Usuń"
}: ActionButtonsProps) => {
    return (
        <div className="flex justify-end items-center gap-2">
            {customActions}

            {onView && (
                <ActionButton
                    onClick={onView}
                    icon={FileText}
                    colorClass="text-blue-600"
                    hoverClass="hover:text-blue-800"
                    title={viewTitle}
                />
            )}

            {onEdit && (
                <ActionButton
                    onClick={onEdit}
                    icon={Edit2}
                    // Screenshot shows Yellow/Gold for edit
                    colorClass="text-amber-600"
                    hoverClass="hover:text-amber-800"
                    title={editTitle}
                />
            )}

            {onDelete && (
                <ActionButton
                    onClick={onDelete}
                    icon={Trash2}
                    colorClass="text-red-600"
                    hoverClass="hover:text-red-800"
                    title={deleteTitle}
                />
            )}
        </div>
    );
};
