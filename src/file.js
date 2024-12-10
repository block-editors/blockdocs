export function downloadFile( blob, filename ) {
	const url = URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename || 'my-file.html'; // Suggested file name
	document.body.appendChild( a );
	a.click();

	// Clean up by removing the anchor and revoking the object URL
	document.body.removeChild( a );
	URL.revokeObjectURL( url );
}
