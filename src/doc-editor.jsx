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
import { CommandMenu } from '@wordpress/commands';

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
import { downloadFile } from './file.js';

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

function DocEditor({ canUseNativeFilesystem }) {
	const hasUndo = useSelect((select) => select('core').hasUndo());
	const { setFile, saveEntityRecord } = useDispatch('core');
	const { createSuccessNotice, createWarningNotice } =
		useDispatch(noticesStore);
	async function onOpen() {
		if (hasUndo) {
			if (
				// eslint-disable-next-line no-alert
				window.confirm(
					'You have unsaved changes. Do you want to save them?'
				)
			) {
				await saveEntityRecord();
			}
		}
		if (window.showOpenFilePicker) {
			const [fileHandle] = await window.showOpenFilePicker({
				types: [
					{
						description: 'Pick a file to open.',
						accept: { [EPUB_MIME_TYPE]: ['.epub'] },
					},
				],
			});
			setFile(fileHandle);
		} else {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.epub';
			input.style.display = 'none';
			input.addEventListener('change', async (event) => {
				setFile(event.target.files[0]);
			});
			document.body.appendChild(input);
			input.click();
			document.body.removeChild(input);
		}
	}
	useEffect(() => {
		createSuccessNotice(
			'Welcome! Edit this document and save it to the file system, or pick an existing one by clicking command button above.'
		);
		if (!canUseNativeFilesystem) {
			createWarningNotice(
				'Limited support in this browser. Files will be downloaded instead of saved. Use Chrome to allow writing to the file system.'
			);
		}
	}, []);
	return (
		<>
			<FullscreenMode isActive={true} />
			<CommandMenu />
			<Editor
				settings={ {
					__unstableResolvedAssets: {
						styles: contentStyles
							.map((css) => `<style>${css}</style>`)
							.join(''),
					},
				} }
				customSaveButton={
					<>
						<Button
							size="compact"
							variant="secondary"
							onClick={ onOpen }
						>
							Open
						</Button>
						<Button
							size="compact"
							variant="primary"
							onClick={() => saveEntityRecord()}
							disabled={ !hasUndo }
						>
							{ canUseNativeFilesystem ? 'Save' : 'Download' }
						</Button>
					</>
				}
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
					label="Title"
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

export default ({ canUseNativeFilesystem }) => (
	<DocEditor canUseNativeFilesystem={ canUseNativeFilesystem } />
);
