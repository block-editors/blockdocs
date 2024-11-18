// eslint-disable-next-line import/no-unresolved
import logoUrl from './assets/logo.png?url';

import { EPUB_MIME_TYPE } from './epub';

// Add manifest.json to the home screen
const link = document.createElement('link');
link.rel = 'manifest';
const manifest = {
	name: 'Blockdocs',
	short_name: 'Blockdocs',
	start_url: new URL('index.html', window.origin).toString(),
	display: 'standalone',
	icons: [
		{
			src: new URL(logoUrl, window.origin).toString(),
			sizes: '512x512',
			type: 'image/png',
		},
	],
	background_color: '#000000',
	theme_color: '#000000',
	file_handlers: [
		{
			action: '/',
			accept: {
				[EPUB_MIME_TYPE]: ['.epub'],
			},
		},
	],
};

const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
link.href = URL.createObjectURL(blob);
document.head.appendChild(link);
