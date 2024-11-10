import {
	Document,
	HeadingLevel,
	Packer,
	Paragraph,
	ImageRun,
	PageSize,
	Header,
	Footer,
	Table,
	TableRow,
	TableCell,
	WidthType,
	TextRun,
	ExternalHyperlink,
} from 'docx';

function getImageSizeFromUrl(url) {
	return new Promise((resolve, reject) => {
		const img = new window.Image();
		img.onload = () => resolve({ width: img.width, height: img.height });
		img.onerror = reject;
		img.src = url;
	});
}

const HeadingLevelMap = {
	P: undefined,
	H1: HeadingLevel.HEADING_1,
	H2: HeadingLevel.HEADING_2,
	H3: HeadingLevel.HEADING_3,
	H4: HeadingLevel.HEADING_4,
	H5: HeadingLevel.HEADING_5,
	H6: HeadingLevel.HEADING_6,
};

const pageWidth = 11906 - 1440 * 2;
const pageWidthPx = pageWidth / 15;

function convertInline(parent) {
	const children = Array.from(parent.childNodes)
		.map((node) => {
			if (node.nodeType === node.TEXT_NODE) {
				return new TextRun(node.textContent);
			}
			if (node.nodeType === node.ELEMENT_NODE) {
				if (node.tagName === 'BR') {
					return new TextRun({ text: '\n' });
				}
				if (node.tagName === 'A') {
					return new ExternalHyperlink({
						link: node.href,
						children: [
							new TextRun({
								text: node.textContent,
								style: 'Hyperlink',
							}),
						],
					});
				}
				return new TextRun({
					text: node.textContent,
					bold: node.tagName === 'B' || node.tagName === 'STRONG',
					italics: node.tagName === 'I' || node.tagName === 'EM',
				});
			}

			return null;
		})
		.filter(Boolean);
	return children;
}

export async function convertToDocx(html) {
	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = html;
	const firstChild = document.body.firstElementChild;
	const header = firstChild.textContent.startsWith('[')
		? firstChild.textContent.slice(1, -1)
		: undefined;
	firstChild.remove();

	const children = [];
	for (const child of doc.body.children) {
		if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'].includes(child.tagName)) {
			children.push(
				new Paragraph({
					heading: HeadingLevelMap[child.tagName],
					keepNext: child.tagName === 'H1',
					keepLines: true,
					spacing: { before: 200, after: 200 },
					children: convertInline(child),
				})
			);
		} else if (child.tagName === 'TABLE') {
			const columnCount = Array.from(child.querySelectorAll('tr')).reduce(
				(_acc, tr) => {
					return Math.max(
						_acc,
						Array.from(tr.querySelectorAll('td,th')).length
					);
				},
				0
			);
			const cellPadding = {
				top: 100, // Top padding (in twips, where 1 twip = 1/1440 inch)
				bottom: 100, // Bottom padding
				left: 100, // Left padding
				right: 100, // Right padding
			};
			children.push(
				new Table({
					// width: {
					//     size: 100,
					//     type: WidthType.PERCENTAGE,
					// },
					spacing: { before: 200, after: 200 },
					columnWidths: Array(columnCount).fill(
						pageWidth / columnCount
					),
					rows: Array.from(child.querySelectorAll('tr')).map(
						(tr) =>
							new TableRow({
								children: Array.from(
									tr.querySelectorAll('td,th')
								).map(
									(td) =>
										new TableCell({
											children: [
												new Paragraph({
													children: convertInline(td),
												}),
											],
											margins: cellPadding,
										})
								),
							})
					),
				})
			);
		} else if (child.tagName === 'OL' || child.tagName === 'UL') {
			const listItems = Array.from(child.querySelectorAll('li')).map(
				(li) =>
					new Paragraph({
						bullet: { level: 0 },
						children: convertInline(li),
					})
			);
			children.push(...listItems);
		} else if (child.tagName === 'FIGURE' && child.querySelector('img')) {
			const img = child.querySelector('img');
			const blob = await fetch(img.src).then((r) => r.blob());
			const dimensions = await getImageSizeFromUrl(img.src);
			let type = img.src.split('#')[1];
			if (type === 'webp') {
				type = 'jpg';
			}
			children.push(
				new Paragraph({
					spacing: { before: 200, after: 200 },
					children: [
						new ImageRun({
							data: await blob.arrayBuffer(),
							type,
							transformation:
								dimensions.width > pageWidthPx
									? {
											width: pageWidthPx,
											height:
												(dimensions.height *
													pageWidthPx) /
												dimensions.width,
										}
									: {
											width: dimensions.width,
											height: dimensions.height,
										},
						}),
					],
				})
			);
		}
	}

	const docx = new Document({
		styles: {
			paragraphStyles: [
				{
					id: 'MySpectacularStyle',
					name: 'My Spectacular Style',
					quickFormat: true,
					run: {
						italics: true,
						color: '990000',
					},
					paragraph: {
						shading: {
							fill: 'FFFF00',
						},
						border: {
							top: {
								color: 'auto',
								space: 1,
								style: 'single',
								size: 6,
							},
							bottom: {
								color: 'auto',
								space: 1,
								style: 'single',
								size: 6,
							},
						},
					},
				},
			],
		},
		sections: [
			{
				headers: {
					default: new Header({
						children: [new Paragraph(header ?? '')],
					}),
				},
				children,
			},
		],
	});

	return await Packer.toBlob(docx);
}
