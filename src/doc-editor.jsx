import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
	privateApis,
	PluginDocumentSettingPanel,
	PluginPostStatusInfo,
} from '@wordpress/editor';
import { unlock } from './lock-unlock';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { setDefaultBlockName, serialize } from '@wordpress/blocks';
import { store as blockEditorStore, __experimentalColorGradientControl as ColorPaletteControl } from '@wordpress/block-editor';
import { convertToDocx } from './docx';
import {
	Button,
	TextControl,
	Modal,
	ColorPalette,
	RangeControl,
	FormFileUpload,
} from '@wordpress/components';
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
import { a } from 'framer-motion/client';

setDefaultBlockName('core/paragraph');

class BlobString extends String {
	constructor(blob) {
		const url = URL.createObjectURL(blob);
		const name =
			blob.name ??
			url.split('/').pop() + '.' + blob.type.split('/').pop();
		super(`${url}#${name}`);
	}
	indexOf(searchString) {
		// Bypass the blob: check
		if (searchString === 'blob:') {
			return -1;
		}
		return super.indexOf(searchString);
	}
}

async function mediaUpload({ filesList, onFileChange }) {
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
	const { hasUndo, currentPostId } = useSelect((select) => {
		return {
			currentPostId: select('core').getCurrentPostId(),
			hasUndo: select('core').hasUndo(),
		};
	});
	const { setFile, saveEntityRecord } = useDispatch('core');
	const { createWarningNotice } = useDispatch(noticesStore);
	async function onOpen() {
		if (hasUndo) {
			if (
				// eslint-disable-next-line no-alert
				window.confirm(
					'You have unsaved changes. Do you want to save them?'
				)
			) {
				await saveEntityRecord(null, null, currentPostId);
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
		if (!canUseNativeFilesystem) {
			createWarningNotice(
				'Limited support in this browser. Files will be downloaded instead of saved. Use Chrome to allow writing to the file system.'
			);
		}

		if ('launchQueue' in window) {
			window.launchQueue.setConsumer(async (launchParams) => {
				if (!launchParams.files || launchParams.files.length === 0) {
					return;
				}
				for (const fileHandle of launchParams.files) {
					const file = await fileHandle.getFile();
					console.log(`Opened file: ${file.name}`);
					// You can now process or display the file in your app
				}
			});
		} else {
			console.log('File Handling API not supported in this browser.');
		}
	}, []);
	if (!currentPostId) {
		return null;
	}
	return (
		<>
			<FullscreenMode isActive={ true } />
			<CommandMenu />
			<Editor
				postId={currentPostId}
				settings={{
					__unstableResolvedAssets: {
						styles: contentStyles
							.map((css) => `<style>${css}</style>`)
							.join(''),
					},
					disableCustomColors: false,
				}}
				customSaveButton={
					<>
						<Button
							size="compact"
							variant={hasUndo ? 'secondary' : 'primary'}
							onClick={onOpen}
						>
							Open
						</Button>
						<Button
							size="compact"
							variant={hasUndo ? 'primary' : 'secondary'}
							onClick={ () =>
								saveEntityRecord(null, null, currentPostId)
							}
							disabled={!hasUndo}
						>
							{canUseNativeFilesystem ? 'Save' : 'Download'}
						</Button>
					</>
				}
			>
				<MediaUpload />
				<DocX />
				<Title currentPostId={currentPostId} />
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
		const docx = await convertToDocx(serialize(getBlocks()));
		downloadFile(docx, 'test.docx');
	}
	return (
		<PluginDocumentSettingPanel name="blockdocs" title="Word File (.docx)">
			<Button variant="primary" onClick={ onClick }>
				Download
			</Button>
		</PluginDocumentSettingPanel>
	);
}

function CoverCanvas({ title, style, coverConfig }) {
	const coverCanvasRef = useRef(null);
	useEffect(() => {
		coverCanvas({
			canvas: coverCanvasRef.current,
			title,
			coverConfig
		});
	}, [title, coverConfig]);
	return <canvas style={ style } ref={ coverCanvasRef } />;
}

function Title({ currentPostId }) {
	const { editEntityRecord } = useDispatch('core');
	const {title, coverConfig} = useSelect(
		(select) =>
			select('core').getEditedEntityRecord(null, null, currentPostId),
		[currentPostId]
	);
	const [fontURL, setFontURL] = useState('');
	const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
	function setTitle(title) {
		editEntityRecord(null, null, currentPostId, { title });
	}
	function setCoverConfig(coverConfig) {
		editEntityRecord(null, null, currentPostId, { coverConfig });
	}
	return (
		<>
			<PluginPostStatusInfo>
				<TextControl label="Title" value={ title } onChange={ setTitle } />
			</PluginPostStatusInfo>
			<PluginPostStatusInfo>
				<Button
					variant="secondary"
					onClick={() => setIsCoverModalOpen(true)}
				>
					Customize Cover
				</Button>
				{isCoverModalOpen && (
					<CoverModal
						title={title}
						setTitle={setTitle}
						fontURL={fontURL}
						setFontURL={setFontURL}
						onClose={() => setIsCoverModalOpen(false)}
						coverConfig={coverConfig}
						setCoverConfig={setCoverConfig}
					/>
				)}
			</PluginPostStatusInfo>
			<PluginPostStatusInfo>
				<CoverCanvas
					style={ { width: '100%', border: '1px solid #000' } }
					title={ title }
					coverConfig={ coverConfig }
				/>
			</PluginPostStatusInfo>
		</>
	);
}

function CoverModal({
	title,
	setTitle,
	onClose,
	coverConfig,
	setCoverConfig,
}) {
	return (
		<Modal
			onRequestClose={onClose}
			size="fill"
			title="Customize Cover"
			className="blockdocs-cover-modal"
		>
			<div
				style={{
					height: '100%',
					display: 'flex',
					gap: '10px',
					flexDirection: 'row',
				} }
			>
				<div style={{ flex: 1, height: '100%', overflow: 'auto' }}>
					<TextControl
						label="Title"
						value={ title }
						onChange={ setTitle }
					/>
					<TextControl
						label="Font URL"
						value={coverConfig.fontFamily}
						onChange={(fontFamily) =>
							setCoverConfig({fontFamily})
						}
					/>
					<ColorPalette value={ coverConfig.color } onChange={ (color) => setCoverConfig({color}) } />
					<ColorPaletteControl
						onColorChange={(color) => color && setCoverConfig({backgroundColor: color})}
						onGradientChange={(gradient) => gradient && setCoverConfig({backgroundColor: gradient})}
						gradientValue={coverConfig.backgroundColor}
						colorValue={coverConfig.backgroundColor}
					/>
					<RangeControl
						label="Font Size"
						max={1000}
						min={100}
						value={coverConfig.fontSize}
						onChange={(fontSize) =>
							setCoverConfig({fontSize})
						}
					/>
					<RangeControl
						label="Padding Left"
						max={100}
						min={0}
						value={coverConfig.paddingLeft}
						onChange={(paddingLeft) => setCoverConfig({paddingLeft})}
					/>
					<RangeControl
						label="Padding Right"
						max={100}
						min={0}
						value={coverConfig.paddingRight}
						onChange={(paddingRight) => setCoverConfig({paddingRight})}
					/>
					<RangeControl
						label="Vertical offset"
						max={50}
						min={-50}
						value={coverConfig.verticalOffset}
						onChange={(verticalOffset) => setCoverConfig({verticalOffset})}
					/>
					<FormFileUpload
						accept=".jpg"
						onChange={(event) => setCoverConfig({custom: event.target.files[0]})}
					>
						Upload custom cover
					</FormFileUpload>
				</div>
				<div style={{ flex: 1, height: '100%' }}>
					<CoverCanvas
						style={ {
							border: '1px solid #000',
							height: '100%',
							maxWidth: '100%',
							display: 'block',
							margin: '0 auto',
						} }
						title={title}
						coverConfig={coverConfig}
					/>
				</div>
			</div>
		</Modal>
	);
}

export default ({ canUseNativeFilesystem }) => (
	<DocEditor canUseNativeFilesystem={canUseNativeFilesystem} />
);
