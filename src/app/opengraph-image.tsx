import { ImageResponse } from 'next/og';
import { OFFICIAL_BRAND_NAME } from '@/lib/brand';

export const runtime = 'nodejs';
export const alt = `${OFFICIAL_BRAND_NAME} — Furnished Self-Catering Apartments in Lusaka, Zambia`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: '#12171F',
          backgroundImage:
            'radial-gradient(circle at 82% 20%, rgba(196, 154, 69, 0.24), transparent 48%), linear-gradient(135deg, #10151C 0%, #18222F 58%, #0E1218 100%)',
          color: '#FBF9F5',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Top brand bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {/* Geometric Brand Emblem */}
            <div
              style={{
                width: '58px',
                height: '58px',
                borderRadius: '12px',
                border: '1.5px solid rgba(224, 190, 115, 0.45)',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="42" height="28" viewBox="0 12 128 84" fill="none">
                <path d="M18 82A48 48 0 0 1 52 36.5L48 44A40 40 0 0 0 22 82H18Z" fill="#E0BE73" />
                <path d="M110 82A48 48 0 0 0 76 36.5L80 44A40 40 0 0 1 106 82H110Z" fill="#E0BE73" />
                <path d="M48 68V42L64 20V60L48 68Z" fill="#E0BE73" />
                <rect x="66" y="23" width="4" height="36" fill="#E0BE73" />
                <rect x="72" y="28" width="4" height="33" fill="#E0BE73" />
                <rect x="78" y="34" width="4" height="30" fill="#E0BE73" />
                <path d="M31 76V55L35 52V73L31 76ZM37 72V51L41 48V70L37 72Z" fill="#E0BE73" />
                <path d="M85 65V51L101 60V74L85 65Z" fill="#E0BE73" />
                <path d="M20 88L51 69L81 88H70L51 76L31 88H20Z" fill="#E0BE73" />
                <path d="M56 71L72 61L112 88H100L72 69L63 75L56 71Z" fill="#E0BE73" />
                <rect x="47" y="80" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="52" y="80" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="47" y="85" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="52" y="85" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="69" y="74" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="74" y="74" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="69" y="79" width="3.5" height="3.5" fill="#E0BE73" />
                <rect x="74" y="79" width="3.5" height="3.5" fill="#E0BE73" />
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '26px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  color: '#FFFFFF',
                }}
              >
                {OFFICIAL_BRAND_NAME}
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontFamily: 'sans-serif',
                  color: '#D5CBB8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Barlaston Park · Lusaka, Zambia
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '10px 18px',
              borderRadius: '999px',
              border: '1px solid rgba(224, 190, 115, 0.45)',
              backgroundColor: 'rgba(196, 154, 69, 0.12)',
              color: '#E8CB88',
              fontSize: '15px',
              fontFamily: 'sans-serif',
              fontWeight: 600,
            }}
          >
            Direct Front-Desk Rates (ZMW)
          </div>
        </div>

        {/* Center headline */}
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '880px' }}>
          <div
            style={{
              fontSize: '58px',
              lineHeight: 1.1,
              fontWeight: 600,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
            }}
          >
            Furnished apartments in Lusaka, set up for a night or a month.
          </div>
          <div
            style={{
              marginTop: '22px',
              fontSize: '23px',
              lineHeight: 1.45,
              fontFamily: 'sans-serif',
              color: '#D6D0C4',
            }}
          >
            Private kitchens, backup power, work-ready Wi-Fi and secure compound parking—booked
            directly with reception.
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            fontFamily: 'sans-serif',
            fontSize: '17px',
            color: '#C7BFB0',
          }}
        >
          <span>Check-in 14:00 · Check-out 10:00</span>
          <span>Airtel Money · MTN MoMo · Bank Transfer · Cash</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
