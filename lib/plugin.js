/*
 * anvil.jslint - JSLint plugin for anvil.js
 * version:	0.0.1
 * author: Elijah Manor <elijah.manor@gmail.com> (http://elijahmanor.com)
 * copyright: 2011 - 2012
 * license:	Dual licensed
 * - MIT (http://www.opensource.org/licenses/mit-license)
 * - GPL (http://www.opensource.org/licenses/gpl-license)
 */
var jslint = require( "jslint" );

var jslintFactory = function( _, anvil ) {
	_.str = require( "underscore.string" );
	_.mixin( _.str.exports() );

	return anvil.plugin({
		name: "anvil.jslint",
		activity: "pre-process",
		all: true, //false, // Change back when this is fixed
		inclusive: false,
		exclusive: false,
		fileList: [],
		commander: [
			[ "-lint, --jslint", "JSLint all JavaScript files" ]
		],

		configure: function( config, command, done ) {
			config = config.jslint;

			// How do I get access to config? I think this is a bug
			anvil.log.event( "config ==== undefined: " + ( config === undefined ) );

			if ( config ) {
				if ( config.all ) {
					this.all = true;
				} else if ( config.include ) {
					this.inclusive = true;
					this.fileList = config.include;
				} else if ( config.exclude ) {
					this.exclusive = true;
					this.fileList = config.exclude;
				}
			} else if ( command.jslint ) {
				this.all = true;
			}

			done();
		},

		run: function( done ) {
			var jsFiles = [];

			anvil.log.event( "BEGIN: run()" );

			if ( this.inclusive ) {
				jsFiles = this.inclusive;
			} else if ( this.all || this.exclusive ) {
				jsFiles = _.filter( anvil.project.files, function( file ) {
					return file.extension() === ".js";
				});

				if ( this.exclusive ) {
					jsFiles = _.reject( jsFiles, function( file ) {
						return _.any( this.fileList, function( excluded ) {
							return excluded.fullPath === file.fullPath;
						});
					});
				}
			}

			if ( jsFiles.length > 0 ) {
				anvil.log.step( "Linting " + jsFiles.length + " files" );
				anvil.scheduler.parallel( jsFiles, this.lint, function() {
					done();
				});
			} else {
				done();
			}

			anvil.log.event( "END: run()" );
		},

		lint: function( file, done ) {
			var that = this;

			anvil.fs.read( [ file.fullPath ], function( content, err ) {
				anvil.log.event( "Linting '"+ file.fullPath + "'" );
				if ( !err ) {
					that.lintContent( content, done );
				} else {
					anvil.log.error( "Error reading " + file.fullPath + " for linting: \n" + err.stack  );
					done();
				}
			});
		},

		lintContent: function( content, done ) {
			var result, options, globals; // TODO - Pull options & globals from somewhere...

			result = jslint( content, options || {}, globals || {} );
			if ( result ) {
				anvil.log.event( "No issues Found." );
			} else {
				_.each( this.processErrors( jslint.errors ), function( error ) {
					anvil.log.error( error );
				});
			}
			done();
		},

		processErrors: function( errors ) {
			var result = [], padding = {};

			padding = {
				line: _.reduce( errors, function( memo, error ) {
					if ( error && error.line.toString().length > memo.toString().length ) {
						memo = error.line.toString();
					}
					return memo;
				}, "" ).length,
				character: _.reduce( errors, function( memo, error ) {
					if ( error && error.character.toString().length > memo.toString().length ) {
						memo = error.character.toString();
					}
					return memo;
				}, "" ).length
			};

			_.each( errors, function( error ) {
				if ( error ) {
					if ( error.evidence ) {
						result.push( "[" + _.lpad( error.line, padding.line, "0" ) + ":" + _.lpad( error.character, padding.character, "0" ) + "] " +
							error.evidence.replace( /^\s*/g, "" ) + " -> " + error.reason );
					} else {
						result.push( "Too Many Errors!" );
					}
				}
			});

			return result;
		}
	});
};

module.exports = jslintFactory;