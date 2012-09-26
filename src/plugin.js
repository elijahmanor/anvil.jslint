var jslint = require( "jslint" );

var jslintFactory = function( _, anvil ) {
	_.str = require( "underscore.string" );
	_.mixin( _.str.exports() );

	return anvil.plugin({
		name: "anvil.jslint",
		activity: "pre-process",
		all: false,
		inclusive: false,
		exclusive: false,
		breakBuild: true,
		ignore: null,
		fileList: [],
		commander: [
			[ "-lint, --jslint", "JSLint all JavaScript files" ]
		],
		settings: {},

		configure: function( config, command, done ) {
			if ( !_.isEmpty( this.config ) ) {
				if ( this.config.all ) {
					this.all = true;
				} else if ( this.config.include && this.config.include.length ) {
					this.inclusive = true;
					this.fileList = this.config.include;
				} else if ( this.config.exclude && this.config.exclude.length ) {
					this.exclusive = true;
					this.fileList = this.config.exclude;
				}

				this.settings = this.getSettings( this.config );
				this.breakBuild = this.config.breakBuild === false ?
					this.config.breakBuild : this.breakBuild;
				this.ignore = this.config.ignore || [];
			} else if ( command.jslint ) {
				this.all = true;
			}

			done();
		},

		getSettings: function( config ) {
			var settings = {};

			if ( config.options ) {
				settings.options = config.options;
			} else {
				// TODO: Look for .jslintrc options in pwd, up tree, or $HOME
			}

			return settings;
		},

		run: function( done ) {
			var jsFiles = [],
			options = {},
			that = this,
			totalErrors = 0,
			transforms;

			if ( this.inclusive ) {
				jsFiles = _.filter( anvil.project.files, this.anyFile( this.fileList ) );
			} else if ( this.all || this.exclusive ) {
				jsFiles = _.filter( anvil.project.files, function( file ) {
					return file.extension() === ".js";
				});
				if ( this.exclusive ) {
					jsFiles = _.reject( jsFiles, this.anyFile( this.fileList ) );
				}
			}

			if ( jsFiles.length > 0 ) {
				anvil.log.step( "Linting " + jsFiles.length + " files" );
				transforms = _.map( jsFiles, function( file ) {
					return function( done ) {
						that.lint( file, function( numberOfErrors ) {
							totalErrors += numberOfErrors;
							done();
						});
					};
				});
				anvil.scheduler.pipeline( undefined, transforms, function() {
					if ( that.breakBuild === true &&
						_.isNumber( totalErrors ) && totalErrors > 0 ) {
						anvil.events.raise( "build.stop", "project has " + totalErrors + " errors(s)!" );
					}
				});
			} else {
				done();
			}
		},

		anyFile: function( list ) {
			return function( file ) {
				return _.any( list, function( name ) {
					var alias = anvil.fs.buildPath( [ file.relativePath, file.name ] );
					return name === alias || ( "/" + name ) == alias;
				});
			};
		},

		lint: function( file, done ) {
			var that = this;

			anvil.log.event( "Linting '"+ file.fullPath + "'" );
			anvil.fs.read( [ file.fullPath ], function( content, err ) {
				if ( !err ) {
					that.lintContent( content, function( numberOfErrors ) {
						done( numberOfErrors );
					});
				} else {
					anvil.log.error( "Error reading " + file.fullPath + " for linting: \n" + err.stack  );
					done();
				}
			});
		},

		lintContent: function( content, done ) {
			var result = jslint( content, this.settings.options || {} ),
				validErrors = [];

			if ( result ) {
				anvil.log.event( "No issues Found." );
			} else {
				validErrors = this.processErrors( jslint.errors, this.ignore );
				_.each( validErrors, function( error ) {
					anvil.log.error( error );
				});
				anvil.log.event( validErrors.length + " issue(s) found." );
				if ( this.ignore.length ) {
					anvil.log.event( jslint.errors.length - validErrors.length + " issue(s) ignored." );
				}
			}

			done( validErrors.length );
		},

		processErrors: function( errors, ignore ) {
			var result = [], padding = {}, that = this;

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
						if ( !that.isIgnorable( error, ignore ) ) {
							result.push( "[" + _.lpad( error.line, padding.line, "0" ) + ":" + _.lpad( error.character, padding.character, "0" ) + "] " +
								error.evidence.replace( /^\s*/g, "" ) + " -> " + error.reason );
						}
					} else {
						result.push( "Too Many Errors!" );
					}
				}
			});

			return result;
		},


		/*
		 * The following option ignores reason for line 81 and character 26
		 * { "line": 81, "character": 26, "reason": "'someVariable' is already defined." }
		 *
		 * The following option ignores any error on line 81 and character 12
		 * { "line": 81, "character": 12 }
		 *
		 * The following option ignores reason anywhere on line 81
		 * { "line": 81, "reason": "'someVariable' is already defined." }
		 *
		 * The following option ignores any errors on line 81
		 * { "line": 81 }
		 *
		 * The following option ignores any errors matching reason anywhere in the file
		 * { "reason": "literal notation" }
		 */
		isIgnorable: function( error, ignoreList ) {
			var ignorable = false;

			ignorable = _.any( ignoreList, function( ignore ) {
				return error.line === ignore.line && error.character === ignore.character && error.reason.indexOf( ignore.reason ) > -1;
			});
			if ( !ignorable ) {
				ignorable = _.any( ignoreList, function( ignore ) {
					return error.line === ignore.line && error.character === ignore.character && !ignore.reason;
				});
			}
			if ( !ignorable ) {
				ignorable = _.any( ignoreList, function( ignore ) {
					return error.line === ignore.line && !ignore.character && error.reason.indexOf( ignore.reason ) > -1;
				});
			}
			if ( !ignorable ) {
				ignorable = _.any( ignoreList, function( ignore ) {
					return error.line === ignore.line && !ignore.character && !ignore.reason;
				});
			}
			if ( !ignorable ) {
				ignorable = _.any( ignoreList, function( ignore ) {
					return !ignore.line && !ignore.character && error.reason.indexOf( ignore.reason ) > -1;
				});
			}

			return ignorable;
		}
	});
};

module.exports = jslintFactory;
