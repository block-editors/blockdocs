import React, { useEffect, useRef } from 'react';
import {
	privateApis,
	PluginDocumentSettingPanel,
	PluginPostStatusInfo,
} from '@wordpress/editor';
import { unlock } from './lock-unlock';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { setDefaultBlockName, serialize } from '@wordpress/blocks';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { convertToDocx } from './docx';
import { Button, TextControl } from '@wordpress/components';
// import { CommandMenu } from '@wordpress/commands';

const { Editor, FullscreenMode } = unlock(privateApis);

import './block-types/auto-generated.js';

import '@wordpress/format-library';

import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/editor/build-style/style.css';
import '@wordpress/commands/build-style/style.css';

import blockEditorContentStyle from '@wordpress/block-editor/build-style/content.css?raw';
import blockLibraryCommonStyle from '@wordpress/block-library/build-style/common.css?raw';
// eslint-disable-next-line import/no-unresolved
import blockLibraryContentStyle from './block-types/auto-generated-content.css?raw';
import componentsStyle from '@wordpress/components/build-style/style.css?raw';

// eslint-disable-next-line import/no-unresolved
import contentStyle from './content.css?raw';

// eslint-disable-next-line import/no-unresolved
import light from './light.css?raw';

const contentStyles = [
	componentsStyle,
	blockLibraryContentStyle,
	blockLibraryCommonStyle,
	blockEditorContentStyle,
	light,
	contentStyle,
];

import { EPUB_MIME_TYPE, coverCanvas } from './epub.js';

setDefaultBlockName('core/paragraph');

class BlobString extends String {
	constructor(blob) {
		const ext = blob.type.split('/')[1];
		let url = URL.createObjectURL(blob);
		if (ext) {
			url += `#${ext}`;
		}
		super(url);
	}
	indexOf(searchString) {
		// Bypass the blob: check
		if (searchString === 'blob:') {
			return -1;
		}
		return super.indexOf(searchString);
	}
}

async function mediaUpload({ allowedTypes, filesList, onError, onFileChange }) {
	const urls = await Promise.all(
		Array.from(filesList).map(async (file) => {
			return new BlobString(file);
		})
	);
	onFileChange(
		urls.map((url) => ({
			id: url.split('/').pop(),
			url,
		}))
	);
}

function DocEditor() {
	const { setFile } = useDispatch('core');
	const { createSuccessNotice } = useDispatch(noticesStore);
	useEffect(() => {
		document.addEventListener('click', async (event) => {
			if (event.target.closest('.editor-document-bar__command')) {
				const [fileHandle] = await window.showOpenFilePicker({
					types: [{ accept: { [EPUB_MIME_TYPE]: ['.epub'] } }],
				});
				setFile(fileHandle);
			}
		});
		createSuccessNotice(
			'Welcome! Edit this document and save it to the file system, or pick an existing one by clicking command button above.'
		);
	}, []);
	return (
		<>
			<FullscreenMode isActive={true} />
			{/* <CommandMenu /> */}
			<Editor
				settings={ {
					__unstableResolvedAssets: {
						styles: contentStyles
							.map((css) => `<style>${css}</style>`)
							.join(''),
					},
				} }
			>
				<MediaUpload />
				<DocX />
				<Title />
			</Editor>
		</>
	);
}

function MediaUpload() {
	const settings = useSelect(
		(select) => select(blockEditorStore).getSettings().mediaUpload
	);
	const { updateSettings } = useDispatch(blockEditorStore);
	useEffect(() => {
		if (settings !== mediaUpload) {
			updateSettings({ mediaUpload });
		}
	}, [settings]);
	return null;
}

function DocX() {
	const { getBlocks } = useSelect(blockEditorStore);
	async function onClick() {
		try {
			const docx = await convertToDocx(serialize(getBlocks()));
			downloadFile(docx, 'test.docx');
		} catch (e) {
			console.error(e);
		}
	}
	return (
		<PluginDocumentSettingPanel name="blockdocs" title="Word File (.docx)">
			<Button variant="primary" onClick={onClick}>
				Download
			</Button>
		</PluginDocumentSettingPanel>
	);
}

function CoverCanvas({ title }) {
	const coverCanvasRef = useRef(null);
	useEffect(() => {
		coverCanvas({ canvas: coverCanvasRef.current, title });
	}, [title]);
	return (
		<canvas
			style={ { width: '100%', border: '1px solid #000' } }
			ref={ coverCanvasRef }
		/>
	);
}

function Title() {
	const { editEntityRecord } = useDispatch('core');
	const title = useSelect(
		(select) => select('core').getEditedEntityRecord().title
	);
	return (
		<>
			<PluginPostStatusInfo>
				<TextControl
					value={title}
					onChange={(title) =>
						editEntityRecord(null, null, null, { title })
					}
				/>
			</PluginPostStatusInfo>
			<PluginPostStatusInfo>
				<CoverCanvas title={title} />
			</PluginPostStatusInfo>
		</>
	);
}

function downloadFile(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename || 'my-file.html'; // Suggested file name
	document.body.appendChild(a);
	a.click();

	// Clean up by removing the anchor and revoking the object URL
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export default ({ canUseNativeFilesystem }) =>
	canUseNativeFilesystem ? (
		<DocEditor />
	) : (
		<p>Native filesystem not supported. Please try Chrome.</p>
	);
