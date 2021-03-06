'use strict';

(function() {
    describe('ShekelServicesController', function() {
        var $rootScope, createController, $httpBackend, tileService, elasticRuntime;
        var services = ['mysql', 'gemfire', 'rabbit', 'redis'];
        var mysqlVersions = ['1.6.5', '1.7.1', '1.6.4', '1.7', '1.3'];

        var vcenter =
            {
                "vm": "vCenter",
                "instances": 1,
                "vcpu": 2,
                "ram": 12,
                "ephemeral_disk": 0,
                "persistent_disk": 125,
                "dynamic_ips": 0,
                "static_ips": 1,
                "singleton": true
            };
        var opsMan =
            {
                "vm": "Ops Manager VM",
                "instances": 1,
                "vcpu": 2,
                "ram": 2,
                "ephemeral_disk": 0,
                "persistent_disk": 150,
                "dynamic_ips": 1,
                "static_ips": 0,
                "singleton": true
            };
        var ers = [ vcenter, opsMan];

        beforeEach(module('ShekelApp'));

        beforeEach(inject(function($injector) {
            $httpBackend = $injector.get('$httpBackend');
            $httpBackend.when('GET', '/services').respond(services);
            $httpBackend.when('GET', '/services/mysql/versions').respond(mysqlVersions);
            $httpBackend.when('GET', '/services/gemfire/versions').respond(mysqlVersions);
            $httpBackend.when('GET', '/services/rabbit/versions').respond(mysqlVersions);
            $httpBackend.when('GET', '/services/redis/versions').respond(mysqlVersions);
            $rootScope = $injector.get('$rootScope');
            tileService = $injector.get('tileService');
            tileService.addTile(tileService.ersName, '1.6.1', ers);
            tileService.enableTile(tileService.ersName);
            
            elasticRuntime = $injector.get('elasticRuntime');
            var $controller = $injector.get('$controller');
            createController = function() {
                return $controller('ShekelServiceSizingController', {
                    '$scope': $rootScope,
                    tileService: tileService
                });
            }
        }));

        afterEach(function() {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });

        describe('listing services', function() {

            beforeEach(function() {
                $httpBackend.expectGET('/services');
                createController();
                $httpBackend.flush();
            });

            it('should return a mysql and gemfire service', function() {
                var returnedServices = $rootScope.services();
                expect(returnedServices).toContain('mysql');
                expect(returnedServices).toContain('gemfire');
            });

            it ('should return as many services as the api returns', function() {
                expect($rootScope.services().length).toBe(services.length)
            });

            it('should initialize the version cache for all the services it finds so ng-repeat works', function() {
                expect(Array.isArray($rootScope.versioncache['mysql'].elements)).toBeTruthy();
                expect(Array.isArray($rootScope.versioncache['gemfire'].elements)).toBeTruthy();
            });

            it('should be disabled by default', function() {
                Object.keys($rootScope.versioncache).forEach(function (service) {
                    expect(service.enabled).toBeFalsy();
                });
            })
        });

        describe('listing versions ', function() {
            var versions = null;

            beforeEach(function() {
                $httpBackend.expectGET('/services/mysql/versions');
                createController();
                $rootScope.getServiceVersions('mysql').then(function(v) {
                    versions = v;
                });
                $httpBackend.flush();
            });

            it('Should return all the mysql versions', function() {
                expect(versions.elements.length).toBe(mysqlVersions.length);
            });

            //It selects the highest element in the versions.
            it('should contain version 1.7 and select 1.7.1 by default', function() {
                expect(versions.elements).toContain('1.7');
                expect(versions.selected).toBe('1.7.1')
            });
        });

        var mysqlBroker = {
            "vm": "MySQL Broker",
            "instances": 2,
            "vcpu": 1,
            "ram": 1,
            "ephemeral_disk": 10,
            "persistent_disk": 0,
            "dynamic_ips": 1,
            "static_ips": 1,
            "singleton": false
        };

        describe('enabling a service', function() {
            beforeEach(function() {
                createController();
                $httpBackend.flush();
                $httpBackend.expectGET('/tile/mysql/1.7.1').respond([mysqlBroker]);
                $rootScope.versioncache['mysql'].enabled = true;
            });

            afterEach(function() {
                $httpBackend.flush();
            });

            it('should add the release to the tile service when enabled', function() {
                var originalNumberTiles = tileService.tiles.length;
                $rootScope.toggleService('mysql').then(function() {
                    expect(originalNumberTiles).toBeLessThan(tileService.tiles.length);
                    expect(Array.isArray(tileService.tiles[tileService.tiles.length - 1].template)).toBeTruthy();
                });
            });

            it('should have a vm named mysql broker at the end so we can group things in the vm list table', function() {
                $rootScope.toggleService('mysql').then(function() {
                    expect(tileService.tiles.length).toBe(2);
                    expect(tileService.tiles[1].template[0].vm).toBe("MySQL Broker");
                    expect(tileService.tiles[1].currentConfig).toBeDefined();
                });
            });

            it('downloads the tiles json', function() {
                $rootScope.getTile('mysql', '1.7.1').then(function(tile) {
                    expect(tile).toBeDefined();
                });
            });
        });

        describe('configuring', function() {
            beforeEach(function () {
                createController();
                $httpBackend.flush();
            });

            describe('getActiveTemplate on an enabled service', function() {
                beforeEach(function () {
                    $rootScope.versioncache['mysql'] = {enabled: true};
                    tileService.tiles.push({
                            vms: [mysqlBroker],
                            name: 'mysql',
                            version: '1.6.1',
                            template: []
                        }
                    );
                });

                it('Should return a template', function () {
                    var template = $rootScope.getActiveTemplate('mysql');
                    expect(template).toBeDefined();
                    expect(Array.isArray(template)).toBeTruthy();
                });

                it('should return a template that preserves modifications', function(){
                    var template = $rootScope.getActiveTemplate('mysql');
                    template.push({changed: true});
                    expect(tileService.getTile('mysql').template.pop().changed).toBeTruthy();
                });
            });

            describe('getActiveTemplate on an disabled service', function () {
                beforeEach(function () {
                    $rootScope.versioncache['mysql'] = {enabled: false};
                });

                it('should not be possible', function () {
                    expect($rootScope.getActiveTemplate('mysql')).toBeNull();
                });
            });

            describe('getActiveTemplate on an undefined service', function() {
                it('should not be possible', function () {
                    expect($rootScope.getActiveTemplate('alsdkfajsldaks')).toBeNull();
                });
            });

            describe('getActiveTemplate on an service tile service hasnt fetched  completley yet', function() {
                beforeEach(function () {
                    $rootScope.versioncache['foo'] = {enabled: true};

                });

                it('should return an empty array', function(){
                    expect(Array.isArray($rootScope.getActiveTemplate('foo'))).toBeTruthy();
                    expect($rootScope.getActiveTemplate('foo').length).toBe(0);
                })
            })
        });

        describe('disabling a service', function() {
            var applyTemplateCalled = false;

            beforeEach(function() {
                elasticRuntime.applyTemplate = function() {
                    applyTemplateCalled = true;
                };
                createController();
                $httpBackend.flush();
                tileService.addTile('mysql', '1.7.1', [mysqlBroker]);
                tileService.enableTile('mysql');
                $rootScope.versioncache['mysql'].enabled = false;
                $rootScope.toggleService('mysql'); //Disable it
            });

            it('should disable the service', function() {
                expect(tileService.getTile('mysql').enabled).toBeFalsy();
            });

            it('should apply the template', function () {
                expect(applyTemplateCalled).toBeTruthy();
            });
        });
    });
})();