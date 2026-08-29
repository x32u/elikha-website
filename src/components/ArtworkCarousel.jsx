import React, { useEffect, useState } from 'react';
import { useStoredUserSettings } from '../hooks/useStoredUserSettings';
import { shouldLoadRichMedia } from '../utils/userSettings';
import './ArtworkCarousel.css';

const PASTEL_THUMBNAIL_PALETTES = [
  ['#FFE7EC', '#FFD8F3', '#E8E7FF'],
  ['#E6F7FF', '#DFF1FF', '#EAF4FF'],
  ['#E8FCEB', '#DDF8ED', '#EFFCF6'],
  ['#FFF4DA', '#FFEBCD', '#FFF6E7'],
  ['#FDEBFF', '#F6E5FF', '#EDEBFF'],
  ['#EAFBF7', '#DDF7F6', '#E9F9FF'],
  ['#FFEDE1', '#FFE4D2', '#FFF1E8'],
  ['#EEF0FF', '#E8E8FF', '#F2F3FF']
];

const getStableColorIndex = (value = '') => {
  const text = String(value);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % PASTEL_THUMBNAIL_PALETTES.length;
};

const shouldRenderImageThumb = (imageUrl) =>
  typeof imageUrl === 'string' && imageUrl.trim().length > 0 &&
  (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('data:image/'));

const isSnapshotDataUri = (imageUrl) => typeof imageUrl === 'string' && imageUrl.startsWith('data:image/');

const keyOutBlackBackground = (source) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(source);
      ctx.drawImage(img, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = frame;
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        const chroma = max - min;
        if (max < 18 && chroma < 14) { data[i + 3] = 0; continue; }
        if (max < 36 && chroma < 20) data[i + 3] = Math.round(data[i + 3] * Math.max(0, (max - 18) / 18));
      }
      ctx.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    } catch (error) {
      console.error('Failed to process carousel snapshot thumbnail:', error);
      resolve(source);
    }
  };
  img.onerror = () => resolve(source);
  img.src = source;
});

const SnapshotThumbnailImage = ({ src, alt, className }) => {
  const [displaySrc, setDisplaySrc] = useState(src);
  useEffect(() => {
    let cancelled = false;
    if (!isSnapshotDataUri(src)) {
      setDisplaySrc(src);
      return () => { cancelled = true; };
    }
    keyOutBlackBackground(src).then((processedSrc) => { if (!cancelled) setDisplaySrc(processedSrc); });
    return () => { cancelled = true; };
  }, [src]);
  return <img src={displaySrc} alt={alt} className={className} />;
};

const ArtworkCarousel = ({ artworks, onArtworkClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const settings = useStoredUserSettings();
  if (!artworks || artworks.length === 0) return null;

  const total = artworks.length;
  const prevIndex = (currentIndex - 1 + total) % total;
  const nextIndex = (currentIndex + 1) % total;
  const handlePrev = () => setCurrentIndex(prevIndex);
  const handleNext = () => setCurrentIndex(nextIndex);

  const renderCard = (artwork, position, colorIndex) => {
    const canLoadImage = shouldLoadRichMedia(settings) && shouldRenderImageThumb(artwork.image);
    const palette = PASTEL_THUMBNAIL_PALETTES[getStableColorIndex(artwork.id || `${artwork.title}-${colorIndex}`)];
    return (
      <button type="button" className={`carousel-card carousel-card--${position}`} onClick={() => {
        if (position === 'center') onArtworkClick?.(artwork);
        else if (position === 'left') handlePrev(); else handleNext();
      }} aria-label={position === 'center' ? `View ${artwork.title}` : position === 'left' ? 'Previous artwork' : 'Next artwork'}>
        <div className="carousel-card__media" style={canLoadImage ? { background: `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 52%, ${palette[2]} 100%)` } : undefined}>
          {canLoadImage ? <SnapshotThumbnailImage src={artwork.image} alt={artwork.title} className={`carousel-card__img ${isSnapshotDataUri(artwork.image) ? 'carousel-card__img--snapshot' : ''}`} /> : (
            <div className={`carousel-card__placeholder color-${(colorIndex % 4) + 1}`}><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM11 13l-2.5 3.01L6 13l-3 4h18l-6-8z"/></svg></div>
          )}
        </div>
        {position === 'center' && <div className="carousel-card__overlay"><span className="carousel-card__title">{artwork.title || 'Untitled Artwork'}</span></div>}
      </button>
    );
  };

  return (
    <div className="artworks-section">
      <h2 className="artworks-section__title">Recent Artworks</h2>
      <div className="carousel-wrapper"><div className="carousel-track">
        {total > 1 && <button type="button" className="carousel-arrow carousel-arrow--left" onClick={handlePrev} aria-label="Previous artwork"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>}
        {total > 1 && renderCard(artworks[prevIndex], 'left', prevIndex)}
        {renderCard(artworks[currentIndex], 'center', currentIndex)}
        {total > 1 && renderCard(artworks[nextIndex], 'right', nextIndex)}
        {total > 1 && <button type="button" className="carousel-arrow carousel-arrow--right" onClick={handleNext} aria-label="Next artwork"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button>}
      </div></div>
      {total > 1 && <div className="carousel-dots">{artworks.map((_, i) => <button key={i} type="button" className={`carousel-dot${i === currentIndex ? ' carousel-dot--active' : ''}`} onClick={() => setCurrentIndex(i)} aria-label={`Go to artwork ${i + 1}`} />)}</div>}
    </div>
  );
};

export default ArtworkCarousel;
