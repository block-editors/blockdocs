import JSZip from 'jszip';

export const EPUB_MIME_TYPE = 'application/epub+zip';

export const OPF_FILE = '_package.xml';
export const NAV_FILE = '_nav.html';

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="${OPF_FILE}" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

const xmlTemplate = ({
	title,
	content,
	language,
}) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${language}">
<head>
<!-- For XHTML compatibility. -->
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>${title}</title>
</head>
<body>
${content}
</body>
</html>
`;

function opfTemplate({ title, uniqueId, modified, language, assets = [] }) {
	return `<?xml version="1.0" encoding="UTF-8" ?>
<package
	version="3.0"
	xmlns="http://www.idpf.org/2007/opf"
	unique-identifier="unique-id"
>
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
	    <dc:title>${title}</dc:title>
	    <dc:identifier id="unique-id">${uniqueId}</dc:identifier>
	    <dc:language>${language}</dc:language>
	    <meta property="dcterms:modified">${modified}</meta>
	</metadata>
	<manifest>
	    <item id="cover" href="cover.jpg" media-type="image/jpg" />
	    <item id="nav" href="${NAV_FILE}" media-type="application/xhtml+xml" properties="nav" />
	    <item id="content" href="index.html" media-type="application/xhtml+xml" />
		${assets.map((asset) => `<item id="a${asset}" href="${asset}" media-type="image/${asset.split('.').pop()}" />`).join('\n')}
	</manifest>
	<spine>
	    <itemref idref="content" />
	</spine>
</package>
`;
}

function navTemplate({ language, nav }) {
	return xmlTemplate({
		language,
		title: 'Navigation',
		content: `<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops">
<ol>${nav
			.map(
				({ title, href }) =>
					`<li><a href="index.html${href}">${title}</a></li>`
			)
			.join('\n')}</ol>
</nav>`,
	});
}

const systemFont =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

function calculateLines(ctx, text, font, maxWidth) {
	ctx.font = font;
	const words = text.split(' ');
	let line = '';
	const lines = [];

	for (const word of words) {
		const testLine = line + (line ? ' ' : '') + word;
		const metrics = ctx.measureText(testLine);
		if (metrics.width > maxWidth && line) {
			lines.push(line);
			line = word;
		} else {
			line = testLine;
		}
	}
	lines.push(line);
	return lines;
}

export function coverCanvas({
	canvas = document.createElement('canvas'),
	title,
	author = '',
	fontFamily,
	color = '#000',
	bgColor = '#fff',
}) {
	const width = 1400;
	const height = 2100;

	if (!fontFamily) {
		fontFamily = systemFont;
	}

	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	const maxTitleLines = 8;

	// Background
	ctx.fillStyle = bgColor;
	ctx.fillRect(0, 0, width, height);

	// Font settings
	const titleFontSize = 160;
	const authorFontSize = 100;
	const lineHeight = 1.2;
	const titleFont = `normal ${titleFontSize}px ${fontFamily}`;
	const authorFont = `italic ${authorFontSize}px ${fontFamily}`;
	const maxWidth = width * 0.8;
	const spacing = 100;

	// Draw title
	ctx.fillStyle = color;
	ctx.textAlign = 'left';

	// Calculate lines for both texts
	let titleLines = calculateLines(ctx, title, titleFont, maxWidth);
	if (titleLines.length > maxTitleLines) {
		titleLines = titleLines.slice(0, maxTitleLines);
		titleLines[titleLines.length - 1] += '…';
	}
	const authorLines = author
		? calculateLines(ctx, author, authorFont, maxWidth)
		: [];

	// Calculate total height and starting position
	const titleHeight = titleLines.length * titleFontSize * lineHeight;
	const authorHeight = authorLines.length * authorFontSize * lineHeight;
	const totalHeight = titleHeight + authorHeight;
	let startY = height / 2 - totalHeight / 2 - (author ? spacing / 2 : 0);

	// Draw title lines
	ctx.font = titleFont;
	titleLines.forEach((line) => {
		const _spacing = titleFontSize * lineHeight - titleFontSize;
		startY += titleFontSize + _spacing / 2;
		ctx.fillText(line, width * 0.1, startY);
		startY += _spacing / 2;
	});

	// Draw author lines
	if (authorLines.length) {
		startY += spacing;
		ctx.font = authorFont;
		authorLines.forEach((line) => {
			const _spacing = authorFontSize * lineHeight - authorFontSize;
			startY += authorFontSize + _spacing / 2;
			ctx.fillText(line, width * 0.1, startY);
			startY += _spacing / 2;
		});
	}

	return canvas;
}

export async function createEPub({
	uniqueId,
	title,
	author,
	content,
	language,
	assets,
	nav = [],
}) {
	const zip = new JSZip();
	zip.file('mimetype', EPUB_MIME_TYPE);
	zip.folder('META-INF').file('container.xml', CONTAINER_XML);
	zip.file('index.html', xmlTemplate({ title, content, language }));
	zip.file(
		'cover.jpg',
		await new Promise((resolve) =>
			coverCanvas({ title, author }).toBlob(resolve, 'image/jpg', 0.9)
		)
	);
	zip.file(
		NAV_FILE,
		navTemplate({
			title,
			language,
			nav: [{ title, href: '' }, ...nav],
		})
	);
	zip.file(
		OPF_FILE,
		opfTemplate({
			title: title ?? 'Untitled',
			uniqueId,
			modified: new Date().toISOString().replace(/\.\d+/, ''),
			language,
			assets: Array.from(assets.keys()),
		})
	);
	for (const [id, blob] of assets.entries()) {
		zip.file(id, blob);
	}
	return await zip.generateAsync({ type: 'blob' });
}
