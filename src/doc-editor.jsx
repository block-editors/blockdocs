import React, { useEffect } from 'react';
import { privateApis } from '@wordpress/editor';
import { unlock } from './lock-unlock';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { setDefaultBlockName } from '@wordpress/blocks';
import { store as blockEditorStore } from '@wordpress/block-editor';
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

setDefaultBlockName('core/paragraph');

class BlobString extends String {
	constructor(blob) {
		super(URL.createObjectURL(blob));
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
					types: [
						{
							description: 'HTML files',
							accept: { 'application/zip': ['.blockdoc'] },
						},
					],
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

export default ({ canUseNativeFilesystem }) =>
	canUseNativeFilesystem ? (
		<DocEditor />
	) : (
		<p>Native filesystem not supported. Please try Chrome.</p>
	);
