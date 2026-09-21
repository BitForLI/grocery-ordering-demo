import { useEffect, useState } from 'react';

export function HomeCarousel({ images, isNarrow }: { images: string[]; isNarrow: boolean }) {
  const slides = images.map((src, i) => ({ src, alt: `Home ${i + 1}` }));
  const [current, setCurrent] = useState(0);
  const heroH = isNarrow ? 200 : 400;
  const multi = slides.length > 1;

  useEffect(() => {
    // Existing carousel synchronization clamps the index after image updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional carousel UI synchronization
    setCurrent((c) => (images.length === 0 ? 0 : Math.min(c, images.length - 1)));
  }, [images.length]);

  if (slides.length === 0) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: isNarrow ? '100%' : 'calc(100% + 6rem)',
        marginLeft: isNarrow ? 0 : '-3rem',
        marginRight: isNarrow ? 0 : '-3rem',
        marginTop: isNarrow ? 0 : '-3rem',
        marginBottom: '2rem',
        borderRadius: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ minHeight: heroH, backgroundColor: '#4b5563' }}>
        <img src={slides[current].src} alt={slides[current].alt} style={{ width: '100%', height: heroH, objectFit: 'cover' }} />
      </div>
      {multi && (
        <>
          <button
            type="button"
            onClick={() => setCurrent((c) => (c === 0 ? slides.length - 1 : c - 1))}
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.4)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCurrent((c) => (c === slides.length - 1 ? 0 : c + 1))}
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.4)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
