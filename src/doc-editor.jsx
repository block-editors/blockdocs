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
import { store as blockEditorStore } from '@wordpress/block-editor';
import { convertToDocx } from './docx';
import {
	Button,
	TextControl,
	Modal,
	ColorPalette,
	GradientPicker,
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

function CoverCanvas({ title, fontLoaded, style, fontFamily, color, bgColor }) {
	const coverCanvasRef = useRef(null);
	useEffect(() => {
		coverCanvas({
			canvas: coverCanvasRef.current,
			title,
			fontFamily,
			color,
			bgColor,
		});
	}, [title, fontLoaded, fontFamily, color, bgColor]);
	return <canvas style={ style } ref={ coverCanvasRef } />;
}

function Title({ currentPostId }) {
	const { editEntityRecord } = useDispatch('core');
	const title = useSelect(
		(select) =>
			select('core').getEditedEntityRecord(null, null, currentPostId)
				.title,
		[currentPostId]
	);
	const [fontURL, setFontURL] = useState('');
	const [fontLoaded, setFontLoaded] = useState({});
	const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
	const [color, setColor] = useState();
	const [bgColor, setBgColor] = useState();
	useEffect(() => {
		function handleFontLoaded() {
			setFontLoaded({});
		}
		document.fonts.addEventListener('loadingdone', handleFontLoaded);
		return () => {
			document.fonts.removeEventListener('loadingdone', handleFontLoaded);
		};
	}, []);
	const fontFamily = useMemo(() => {
		try {
			return fontURL ? new URL(fontURL).searchParams.get('family') : '';
		} catch (e) {
			return '';
		}
	}, [fontURL]);
	function setTitle(title) {
		editEntityRecord(null, null, currentPostId, { title });
	}
	console.log('test')
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
						fontLoaded={fontLoaded}
						fontFamily={fontFamily}
						color={color}
						bgColor={bgColor}
						setColor={setColor}
						setBgColor={setBgColor}
					/>
				)}
				{fontURL && (
					<link
						href={ fontURL }
						rel="stylesheet"
						onLoad={ () => setFontLoaded({}) }
					/>
				)}
			</PluginPostStatusInfo>
			<PluginPostStatusInfo>
				<CoverCanvas
					style={ { width: '100%', border: '1px solid #000' } }
					title={ title }
					fontLoaded={ fontLoaded }
					fontFamily={ fontFamily }
					color={ color }
					bgColor={ bgColor }
				/>
			</PluginPostStatusInfo>
		</>
	);
}

function CoverModal({
	title,
	setTitle,
	fontURL,
	setFontURL,
	fontLoaded,
	fontFamily,
	color,
	setColor,
	bgColor,
	setBgColor,
	onClose,
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
						value={fontURL}
						onChange={setFontURL}
					/>
					<ColorPalette value={ color } onChange={ setColor } />
					<ColorPalette value={ bgColor } onChange={ setBgColor } />
					{/* <GradientPicker
						gradients={[
							{
								gradient:
									'linear-gradient(135deg,rgba(6,147,227,1) 0%,rgb(155,81,224) 100%)',
								name: 'Vivid cyan blue to vivid purple',
								slug: 'vivid-cyan-blue-to-vivid-purple',
							},
							{
								gradient:
									'linear-gradient(135deg,rgb(122,220,180) 0%,rgb(0,208,130) 100%)',
								name: 'Light green cyan to vivid green cyan',
								slug: 'light-green-cyan-to-vivid-green-cyan',
							},
							{
								gradient:
									'linear-gradient(135deg,rgba(252,185,0,1) 0%,rgba(255,105,0,1) 100%)',
								name: 'Luminous vivid amber to luminous vivid orange',
								slug: 'luminous-vivid-amber-to-luminous-vivid-orange',
							},
							{
								gradient:
									'linear-gradient(135deg,rgba(255,105,0,1) 0%,rgb(207,46,46) 100%)',
								name: 'Luminous vivid orange to vivid red',
								slug: 'luminous-vivid-orange-to-vivid-red',
							},
							{
								gradient:
									'linear-gradient(135deg,rgb(238,238,238) 0%,rgb(169,184,195) 100%)',
								name: 'Very light gray to cyan bluish gray',
								slug: 'very-light-gray-to-cyan-bluish-gray',
							},
							{
								gradient:
									'linear-gradient(135deg,rgb(74,234,220) 0%,rgb(151,120,209) 20%,rgb(207,42,186) 40%,rgb(238,44,130) 60%,rgb(251,105,98) 80%,rgb(254,248,76) 100%)',
								name: 'Cool to warm spectrum',
								slug: 'cool-to-warm-spectrum',
							},
						]}
						onChange={setBgColor}
						value={bgColor}
					/> */}
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
						fontLoaded={fontLoaded}
						fontFamily={fontFamily}
						color={color}
						bgColor={bgColor}
					/>
				</div>
			</div>
		</Modal>
	);
}

export default ({ canUseNativeFilesystem }) => (
	<DocEditor canUseNativeFilesystem={canUseNativeFilesystem} />
);
