// Tipo do web component <video-rtc> do go2rtc (player WebRTC/MSE usado em Cameras.tsx).
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'video-rtc': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        mode?: string;
        media?: string;
        background?: boolean | string;
        autoplay?: boolean;
      };
    }
  }
}
