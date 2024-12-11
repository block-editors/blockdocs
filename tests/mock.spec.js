import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const fsaMockPath = path.resolve(
	'node_modules',
	'fsa-mock',
	'dist',
	'fsa-mock.umd.cjs'
);
const fsaMockScript = fs.readFileSync( fsaMockPath, 'utf8' );

function canvas( page ) {
	return page.frameLocator( '[name="editor-canvas"]' );
}

async function getPaths( page ) {
	return await page.evaluate( () => {
		return window.fsaMock.mock.fs().getDescendantPaths( '' );
	} );
}

export async function saveFile( page, name, zip ) {
	const base64 = await zip.generateAsync( {
		type: 'base64',
		platform: 'node',
	} );
	return await page.evaluate(
		async ( { name: _name, base64: _base64 } ) => {
			const binaryString = window.atob( _base64 );
			const len = binaryString.length;
			const bytes = new Uint8Array( len );
			for ( let i = 0; i < len; i++ ) {
				bytes[ i ] = binaryString.charCodeAt( i );
			}
			window.fsaMock.mock.createFile( _name, bytes.buffer );
		},
		{ name, base64 }
	);
}

async function getContents( page, _path ) {
	const base64 = await page.evaluate( ( __path ) => {
		const buffer = window.fsaMock.mock.contents( __path );
		let binary = '';
		const bytes = new Uint8Array( buffer );
		const len = bytes.byteLength;
		for ( let i = 0; i < len; i++ ) {
			binary += String.fromCharCode( bytes[ i ] );
		}
		return btoa( binary );
	}, _path );

	return await JSZip.loadAsync( base64, { base64: true } );
}

async function isFile( page, _path ) {
	return await page.evaluate( ( __path ) => {
		return window.fsaMock.mock.isFile( __path );
	}, _path );
}

test.describe( 'Blocknotes', () => {
	test.beforeEach( async ( { page } ) => {
		await page.addInitScript( fsaMockScript );
		await page.addInitScript( () => {
			const { mock } = window.fsaMock;
			mock.install();
			mock.onDirectoryPicker( () => '' );
			mock.onOpenFilePicker( () => [ 'test.epub' ] );
			mock.onSaveFilePicker( () => 'test.epub' );
		} );

		await page.goto( '/' );

		page.on( 'pageerror', ( error ) => {
			throw error;
		} );
	} );

	test.afterEach( async ( { page } ) => {
		await page.evaluate( () => {
			const { mock } = window.fsaMock;
			mock.uninstall();
		} );
	} );

	test( 'save and open file', async ( { page } ) => {
		await expect( page ).toHaveTitle( /Blockdocs/ );

		const saveButton = page.getByRole( 'button', { name: 'Save' } );

		await expect( saveButton ).toBeDisabled();

		const emptyBlock = canvas( page ).getByRole( 'document', {
			name: 'Empty block',
		} );

		await emptyBlock.click();

		await expect( emptyBlock ).toBeFocused();

		await page.keyboard.type( 'test' );

		await expect(
			canvas( page ).getByRole( 'document', { name: 'Block: Paragraph' } )
		).toBeFocused();

		await saveButton.click();

		await page.waitForSelector( '.components-notice.is-success' );

		// Ensure the initial file is gone and renamed, expect no other files.
		expect( await getPaths( page ) ).toEqual( [ 'test.epub' ] );
		expect( await isFile( page, 'test.epub' ) ).toBe( true );
		const zip = await getContents( page, 'test.epub' );
		expect( Object.keys( zip.files ) ).toEqual( [
			'mimetype',
			'META-INF/',
			'META-INF/container.xml',
			'index.html',
			'cover.jpg',
			'cover.json',
			'_nav.html',
			'_package.xml',
		] );
		expect( await zip.files[ 'index.html' ].async( 'string' ) ).toBe(
			`<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<!-- For XHTML compatibility. -->
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>Untitled Document</title>
</head>
<body>
<!-- wp:paragraph -->
<p>test</p>
<!-- /wp:paragraph -->


</body></html>`
		);

		// reload the page
		await page.reload();

		await expect( saveButton ).toBeDisabled();

		await saveFile( page, 'test.epub', zip );

		expect( await getPaths( page ) ).toEqual( [ 'test.epub' ] );

		const openButton = page.getByRole( 'button', {
			name: 'Open',
			exact: true,
		} );
		await expect( openButton ).toBeEnabled();
		await openButton.click();

		await expect(
			canvas( page ).getByRole( 'document', {
				name: 'Block: Paragraph',
			} )
		).toHaveText( 'test' );
	} );

	test.skip( 'undo/redo', async ( { page } ) => {
		const emptyBlock = canvas( page ).getByRole( 'document', {
			name: 'Empty block',
		} );

		await emptyBlock.click();

		const undo = page.getByRole( 'button', { name: 'Undo' } );
		const redo = page.getByRole( 'button', { name: 'Redo' } );

		await expect( undo ).toBeDisabled();
		await expect( redo ).toBeDisabled();

		await page.keyboard.type( 'a' );

		await expect( undo ).toBeEnabled();
		await expect( redo ).toBeDisabled();

		// Typing a second character within 1s should be within the same undo
		// step.
		await page.waitForTimeout( 500 );
		await page.keyboard.type( 'b' );

		await page.waitForTimeout( 1000 );
		await page.keyboard.type( 'c' );

		const paragraph = canvas( page ).getByRole( 'document', {
			name: 'Block: Paragraph',
		} );

		await expect( paragraph ).toHaveText( 'abc' );

		await page.keyboard.press( 'Meta+z' );

		await expect( paragraph ).toHaveText( 'ab' );
		await expect( undo ).toBeEnabled();
		await expect( redo ).toBeEnabled();

		await undo.click();

		// const emptyBlock = canvas( page ).getByRole( 'document', {
		// 	name: 'Empty block',
		// } );

		await expect( emptyBlock ).toBeFocused();
		await expect( undo ).toBeDisabled();

		await page.keyboard.press( 'Meta+Shift+z' );

		await expect( paragraph ).toHaveText( 'ab' );
		await expect( undo ).toBeEnabled();
		await expect( redo ).toBeEnabled();

		await redo.click();

		await expect( paragraph ).toHaveText( 'abc' );
		await expect( undo ).toBeEnabled();
		await expect( redo ).toBeDisabled();

		await undo.click();
		await expect( redo ).toBeEnabled();
		await page.keyboard.type( 'd' );
		await expect( redo ).toBeDisabled();
	} );
} );
