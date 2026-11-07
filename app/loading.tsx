export default function Loading() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
            <span className="flex items-center gap-3 text-sm text-gray-600">
                <span
                    className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                    aria-hidden="true"
                />
                Loading…
            </span>
        </div>
    );
}
