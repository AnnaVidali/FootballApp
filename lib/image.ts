// Downscale an image in the browser before uploading, so the gallery stays
// small and fast to load. Returns a JPEG blob (or the original file on failure).

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read image"));
        image.src = src;
    });
}

export async function compressImage(
    file: File,
    maxDimension = 1600,
    quality = 0.82
): Promise<Blob> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await loadImage(objectUrl);
        const longest = Math.max(image.naturalWidth, image.naturalHeight);
        // Never upscale; only shrink images larger than the limit.
        const scale = longest > maxDimension ? maxDimension / longest : 1;
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(image, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );
        return blob ?? file;
    } catch {
        return file;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
