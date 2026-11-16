"use client";

export default function ColorField({
    id,
    label,
    value,
    onChange,
    disabled = false,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                {label}
            </label>
            <div className="flex items-center gap-3">
                <input
                    id={id}
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                />
                <span className="text-sm text-gray-500">{value}</span>
            </div>
        </div>
    );
}
