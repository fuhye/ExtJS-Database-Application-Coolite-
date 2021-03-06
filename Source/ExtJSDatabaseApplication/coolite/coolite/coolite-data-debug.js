/*
 * @version   : 0.8.2 - Professional Edition (Coolite Professional License)
 * @author    : Coolite Inc. http://www.coolite.com/
 * @date      : 2009-12-21
 * @copyright : Copyright (c) 2006-2009, Coolite Inc. (http://www.coolite.com/). All rights reserved.
 * @license   : See license.txt and http://www.coolite.com/license/.
 */


// @source data/HttpProxy.js

Ext.data.HttpProxy.prototype.load = Ext.data.HttpProxy.prototype.load.createInterceptor(function (params, reader, callback, scope, arg) {
    if (this.conn.json) {
        this.conn.jsonData = params;
    }
});

// @source data/HttpWriteProxy.js

Coolite.Ext.HttpWriteProxy = function (conn) {
    Coolite.Ext.HttpWriteProxy.superclass.constructor.call(this);
    this.conn = conn;
    this.useAjax = !conn || !conn.events;
    
    if (conn && conn.handleSaveResponseAsXml) {
        this.handleSaveResponseAsXml = conn.handleSaveResponseAsXml;
    }
};

Ext.extend(Coolite.Ext.HttpWriteProxy, Ext.data.HttpProxy, {
    handleSaveResponseAsXml : false,
    save : function (params, reader, callback, scope, arg) {
        if (this.fireEvent("beforesave", this, params) !== false) {
            var o = {
                params   : params || {},
                request  : {
                    callback : callback,
                    scope    : scope,
                    arg      : arg
                },
                reader   : reader,
                scope    : this,
                callback : this.saveResponse
            };
            
            if (this.useAjax) {
                Ext.applyIf(o, this.conn);
                o.url = this.conn.url;
                
                if (this.activeRequest) {
                    Ext.Ajax.abort(this.activeRequest);
                }
                this.activeRequest = Ext.Ajax.request(o);
            } else {
                this.conn.reequest(o);
            }
        } else {
            callback.call(scope || this, null, arg, false);
        }
    },

    saveResponse : function (o, success, response) {
        delete this.activeRequest;
        
        if (!success) {
            this.fireEvent("saveexception", this, o, response, { message : response.statusText });
            o.request.callback.call(o.request.scope, null, o.request.arg, false);
            return;
        }
        
        var result;
        
        try {
            if (!this.handleSaveResponseAsXml) {
                var json = response.responseText,
                    responseObj = eval("(" + json + ")");
                    
                result = {
                    success : responseObj.Success,
                    msg     : responseObj.Msg,
                    data    : responseObj.Data
                };
            }
            else {
                var doc = response.responseXML,
                    root = doc.documentElement || doc,
                    q = Ext.DomQuery,
                    sv = q.selectValue("Success", root, false);
                    
                success = sv !== false && sv !== "false";
                
                result = { success : success, msg : q.selectValue("Msg", root, "") };
            }
        } catch (e) {
            this.fireEvent("saveexception", this, o, response, e);
            o.request.callback.call(o.request.scope, null, o.request.arg, false);
            return;
        }
        
        this.fireEvent("save", this, o, o.request.arg);
        o.request.callback.call(o.request.scope, result, o.request.arg, true);
    }
});

// @source data/GroupingStore.js

Ext.override(Ext.data.GroupingStore, {
    applySort : function () {
        Ext.data.GroupingStore.superclass.applySort.call(this);
        
        if (!this.groupOnSort && !this.remoteGroup) {
            var gs = this.getGroupState();
            
            if (gs && gs != (Ext.isEmpty(this.sortInfo) ? "" : this.sortInfo.field)) {
                this.sortData(this.groupField);
            }
        }
    }
});

// @source data/Store.js

Ext.data.GroupingStore.prototype.clearGrouping = Ext.data.GroupingStore.prototype.clearGrouping.createInterceptor(function () {
    if (this.remoteGroup) {
        if (this.lastOptions && this.lastOptions.params) {
            delete this.lastOptions.params.groupBy;
        }
    }
});

Coolite.Ext.Store = function (config) {
    Ext.apply(this, config);

    this.deleted = [];
    
    this.addEvents(
        "beforesave",
        "save",
        "saveexception",
        "commitdone",
        "commitfailed");

    if (this.updateProxy) {
        this.relayEvents(this.updateProxy, ["saveexception"]);
    }

    if (!Ext.isEmpty(this.updateProxy)) {
        this.on("saveexception", function (ds, o, response, e) {
            if (this.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, e.message);
            }
        }, this);
    }

    if (this.proxy && !this.proxy.refreshByUrl && !this.proxy.isDataProxy) {
        this.on("loadexception", function (ds, o, response, e) {
            if (this.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, response.responseText);
            }
        }, this);
    }

    Coolite.Ext.Store.superclass.constructor.call(this);
};

Ext.extend(Coolite.Ext.Store, Ext.data.GroupingStore, {
    pruneModifiedRecords : true,
    warningOnDirty       : true,
    
    dirtyWarningTitle    : "Uncommitted Changes",
    
    dirtyWarningText     : "You have uncommitted changes.  Are you sure you want to reload data?",
    updateProxy          : null,

    // "none" - no refresh after saving
    // "always" - always refresh after saving
    // "auto" - auto refresh. If no new records then refresh doesn't perfom. If new records exists then refresh will be perfom for refresh id fields
    refreshAfterSave     : "Auto",
    useIdConfirmation    : false,
    showWarningOnFailure : true,
    
    metaId : function () {
        if (this.reader.isArrayReader) {
            var id = Ext.num(parseInt(this.reader.meta.id, 10), -1);
            
            if (id !== -1) {
                return this.reader.meta.fields[id].name;
            }
        }

        return this.reader.meta.id;
    },

    addRecord: function (values) {
        this.clearFilter(false);
        var rowIndex = this.data.length;
        var record = this.insertRecord(rowIndex, values);
        return { index: rowIndex, record: record };
    },

    addSortedRecord : function (values) {
        this.clearFilter(false);
        return this.insertRecord(0, values, true);
    },

    insertRecord : function (rowIndex, values, asSorted) {
        this.clearFilter(false);

        values = values || {};
        
        var f = this.recordType.prototype.fields, dv = {};

        for (var i = 0; i < f.length; i++) {
            dv[f.items[i].name] = f.items[i].defaultValue;
        }

        var record = new this.recordType(dv, values[this.metaId()]), v;
        record.newRecord = true;
        
        if (this.modified.indexOf(record) == -1) {
            this.modified.push(record);
        }

        if (!asSorted) {
            this.insert(rowIndex, record);

            for (v in values) {
                record.set(v, values[v]);
            }
        } else {
            for (v in values) {
                record.set(v, values[v]);
            }

            this.addSorted(record);
        }

        if (!Ext.isEmpty(this.metaId())) {
            record.set(this.metaId(), record.id);
        }

        return record;
    },

    addField : function (field, index) {
        if (typeof field == "string") {
            field = { name: field };
        }

        if (Ext.isEmpty(this.recordType)) {
            this.recordType = Ext.data.Record.create([]);
        }

        field = new Ext.data.Field(field);

        if (Ext.isEmpty(index)) {
            this.recordType.prototype.fields.replace(field);
        } else {
            this.recordType.prototype.fields.insert(index, field);
        }

        if (typeof field.defaultValue != "undefined") {
            this.each(function (r) {
                if (typeof r.data[field.name] == "undefined") {
                    r.data[field.name] = field.defaultValue;
                }
            });
        }
    },

    removeFields : function () {
        if (this.recordType) {
            this.recordType.prototype.fields.clear();
        }
        
        this.removeAll();
    },

    removeField : function (name) {
        this.recordType.prototype.fields.removeKey(name);

        this.each(function (r) {
            delete r.data[name];
            
            if (r.modified) {
                delete r.modified[name];
            }
        });
    },

    prepareRecord : function (data, record, options, isNew) {
        var newData = {};

        if (options.visibleOnly && options.grid) {
            var cm = options.grid.getColumnModel();

            for (var i in data) {
                var columnIndex = cm.findColumnIndex(i);
                
                if (columnIndex > -1 && !cm.isHidden(columnIndex)) {
                    newData[i] = data[i];
                }
            }

            data = newData;
        }

        if (options.dirtyOnly && !isNew) {
            for (var j in data) {
                if (record.isModified(j)) {
                    newData[j] = data[j];
                }
            }

            data = newData;
        }

        for (var k in data) {
            if (data[k] === "" && this.isSimpleField(k)) {
                data[k] = null;
            }
        }

        return data;
    },

    isSimpleField : function (name) {
        for (var i = 0; i < this.fields.getCount(); i++) {
            var field = this.fields.get(i);
            
            if (name === (field.mapping || field.name)) {
                return field.type === "int" || field.type === "float" || field.type === "boolean" || field.type === "date";
            }
        }

        return false;
    },

    getRecordsValues : function (options) {
        options = options || {};
        
        var records = (options.currentPageOnly ? this.getRange() : this.getAllRange()) || [],
            values = [],
            i;        

        for (i = 0; i < records.length; i++) {
            var obj = {}, dataR;
            
            if (this.metaId()) {
                obj[this.metaId()] = records[i].id;
            }

            dataR = Ext.apply(obj, records[i].data);
            dataR = this.prepareRecord(dataR, records[i], options);

            if (!Ext.isEmptyObj(dataR)) {
                values.push(dataR);
            }
        }

        return values;
    },

    refreshIds : function (newRecordsExists, deletedExists, dataAbsent) {
        switch (this.refreshAfterSave) {
        case "None":
            return;
        case "Always":
            if (dataAbsent) {
                this.reload();
            } else {
                this.reload(undefined, true);
            }
            break;
        case "Auto":
            if (newRecordsExists || deletedExists) {
                if (dataAbsent) {
                    this.reload();
                } else {
                    this.reload(undefined, true);
                }
            }
            break;
        }
    },

    reload : function (options, baseReload) {
        if (this.proxy.refreshByUrl && baseReload !== true) {
            var opts = options || {};
            opts.params = opts.params || {};            
            this.callbackReload(this.warningOnDirty, opts);
        } else {
            if (options && options.params && options.params.submitAjaxEventConfig) {
                delete options.params.submitAjaxEventConfig;
            }
            
            Coolite.Ext.Store.superclass.reload.call(this, options);
        }
    },

    load : function (options) {
        var loadData = function (store, options) {
            store.deleted = [];
            store.modified = [];
            
            return Coolite.Ext.Store.superclass.load.call(store, options);
        };

        if (this.warningOnDirty && this.isDirty() && !this.silentMode) {
            this.silentMode = false;
            Ext.MessageBox.confirm(
                this.dirtyWarningTitle,
                this.dirtyWarningText,
                function (btn, text) {
                    return (btn == "yes") ? loadData(this, options) : false;
                },
                this
            );
        } else {
            return loadData(this, options);
        }
    },

    save : function (options) {
        if (Ext.isEmpty(this.updateProxy)) {
            this.callbackSave(options);
            return;
        }

        options = options || {};

        if (this.fireEvent("beforesave", this, options) !== false) {
            var json = this.getChangedData(options);

            if (json.length > 0) {
                var p = Ext.apply(options.params || {}, { data: "{" + json + "}" });
                this.updateProxy.save(p, this.reader, this.recordsSaved, this, options);
            } else {
                this.fireEvent("commitdone", this, options);
            }
        }
    },

    getChangedData : function (options) {
        options = options || {};
        var json = "",
            d = this.deleted,
            m = this.modified;

        if (d.length > 0) {
            json += '"Deleted":[';

            var exists = false;

            for (var i = 0; i < d.length; i++) {
                var obj = {},
                    list = Ext.apply(obj, d[i].data);

                if (this.metaId() && Ext.isEmpty(list[this.metaId()], false)) {
                    list[this.metaId()] = d[i].id;
                }

                list = this.prepareRecord(list, d[i], options);

                if (!Ext.isEmptyObj(list)) {
                    json += Ext.util.JSON.encode(list) + ",";
                    exists = true;
                }
            }

            if (exists) {
                json = json.substring(0, json.length - 1) + "]";
            } else {
                json = "";
            }
        }

        var jsonUpdated = "",
            jsonCreated = "";

        for (var j = 0; j < m.length; j++) {

            var obj2 = {},
                list2 = Ext.apply(obj2, m[j].data);

            if (this.metaId() && Ext.isEmpty(list2[this.metaId()], false)) {
                list2[this.metaId()] = m[j].id;
            }

            if (m[j].newRecord && this.skipIdForNewRecords !== false && !this.useIdConfirmation) {
                list2[this.metaId()] = undefined;
            }

            list2 = this.prepareRecord(list2, m[j], options, m[j].newRecord);

            if (!Ext.isEmptyObj(list2)) {
                if (m[j].newRecord) {
                    jsonCreated += Ext.util.JSON.encode(list2) + ",";
                } else {
                    jsonUpdated += Ext.util.JSON.encode(list2) + ",";
                }
            }
        }

        if (jsonUpdated.length > 0) {
            jsonUpdated = jsonUpdated.substring(0, jsonUpdated.length - 1) + "]";
        }

        if (jsonCreated.length > 0) {
            jsonCreated = jsonCreated.substring(0, jsonCreated.length - 1) + "]";
        }

        if (jsonUpdated.length > 0) {
            if (json.length > 0) {
                json += ",";
            }

            json += '"Updated":[';
            json += jsonUpdated;
        }

        if (jsonCreated.length > 0) {
            if (json.length > 0) {
                json += ",";
            }

            json += '"Created":[';
            json += jsonCreated;
        }

        return json;
    },

    getByDataId : function (id) {
        if (!this.metaId()) {
            return undefined;
        }

        var m = this.modified, i;

        for (i = 0; i < m.length; i++) {
            if (m[i].data[this.metaId()] == id) {
                return m[i];
            }
        }

        return undefined;
    },

    recordsSaved : function (o, options, success) {
        if (!o || success === false) {
            if (success !== false) {
                this.fireEvent("save", this, options);
            }

            if (options.callback) {
                options.callback.call(options.scope || this, options, false);
            }

            return;
        }

        var serverSuccess = o.success,
            msg = o.msg;

        this.fireEvent("save", this, options);

        if (options.callback) {
            options.callback.call(options.scope || this, options, true);
        }

        var serviceResult = o.data || {},
            newRecordsExists = false,
            deletedExists = this.deleted.length > 0,
            m = this.modified,
            j;

        for (j = 0; j < m.length; j++) {
            if (m[j].newRecord) {
                newRecordsExists = true;
                break;
            }
        }

        if (!serverSuccess) {
            this.fireEvent("commitfailed", this, msg);

            if (this.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure({ status: "", statusText: "" }, msg);
            }

            return;
        }

        if (this.useIdConfirmation) {
            if (Ext.isEmpty(serviceResult.confirm)) {
                msg = "The confirmation list is absent";
                this.fireEvent("commitfailed", this, msg);

                if (this.showWarningOnFailure) {
                    Coolite.AjaxEvent.showFailure({ status: "", statusText: "" }, msg);
                }
                return;
            }

            var r = serviceResult.confirm,
                failCount = 0;

            for (var i = 0; i < r.length; i++) {
                if (r[i].s === false) {
                    failCount++;
                } else {
                    var record = this.getById(r[i].oldId) || this.getByDataId(r[i].oldId);

                    if (record) {
                        record.commit();
                        if (record.newRecord || false) {
                            delete record.newRecord;
                            var index = this.data.indexOf(record);
                            this.data.removeAt(index);
                            record.id = r[i].newId || r[i].oldId;
                            
                            if (this.metaId()) {
                                record.data[this.metaId()] = record.id;
                            }
                            
                            this.data.insert(index, record);
                        }
                    } else {
                        var d = this.deleted;

                        for (var i2 = 0; i2 < d.length; i2++) {
                            if (this.metaId() && d[i2].id == r[i].oldId) {
                                this.deleted.splice(i2, 1);
                                failCount--;
                                break;
                            }
                        }
                        failCount++;
                    }
                }
            }

            if (failCount > 0) {
                msg = "Some records have no success confirmation!";
                this.fireEvent("commitfailed", this, msg);

                if (this.showWarningOnFailure) {
                    Coolite.AjaxEvent.showFailure({ status: "", statusText: "" }, msg);
                }
                
                return;
            }

            this.modified = [];
            this.deleted = [];
        } else {
            this.commitChanges();
        }


        this.fireEvent("commitdone", this, options);

        var dataAbsent = true;

        if (serviceResult.data && serviceResult.data !== null && this.proxy.refreshData) {
            dataAbsent = false;
            this.proxy.refreshData(serviceResult.data);
            
            if (this.isPagingStore()) {
                this.loadData(serviceResult.data);
                this.load(this.lastOptions);
            }
        }

        this.refreshIds(newRecordsExists, deletedExists, dataAbsent);
    },

    isPagingStore : function () {
        return this.isPaging && this.applyPaging;
    },

    getDeletedRecords : function () {
        return this.deleted;
    },

    remove : function (record) {
        if (!record.newRecord) {
            this.deleted.push(record);
        }

        Coolite.Ext.Store.superclass.remove.call(this, record);
    },

    commitChanges : function () {
        Coolite.Ext.Store.superclass.commitChanges.call(this);
        this.deleted = [];
    },

    rejectChanges : function () {
        Coolite.Ext.Store.superclass.rejectChanges.call(this);

        var d = this.deleted.slice(0);

        this.deleted = [];
        this.add(d);

        for (var i = 0, len = d.length; i < len; i++) {
            d[i].reject();
        }
    },

    isDirty : function () {
        return (this.deleted.length > 0 || this.modified.length > 0) ? true : false;
    },

    prepareCallback : function (context, options) {
        options = options || {};
        options.params = options.params || {};

        if (context.fireEvent("beforesave", context, options) !== false) {
            var json = context.getChangedData(options);

            if (json.length > 0) {
                var p = { data: "{" + json + "}", extraParams: options.params };
                return p;
            } else {
                context.fireEvent("commitdone", context, options);
            }
        }
        return null;
    },

    callbackHandler : function (response, result, context, type, action, extraParams, o) {
        try {
            var responseObj = result.serviceResponse;

            result = { success: responseObj.Success, msg: responseObj.Msg, data: responseObj.Data };
        } catch (e) {
            context.fireEvent("saveexception", context, {}, response, e);

            if (context.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, e.message);
            }
            return;
        }
        context.recordsSaved(result, {}, true);
    },

    silentMode : false,

    callbackRefreshHandler : function (response, result, context, type, action, extraParams, o) {
        var p = context.proxy;

        try {
            var responseObj = result.serviceResponse;
            result = { success: responseObj.Success, msg: responseObj.Msg || null, data: responseObj.Data || {} };
        } catch (e) {
            context.fireEvent("loadexception", context, {}, response, e);
            
            if (context.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, e.message);
            }

            if (o && o.userCallback) {
                o.userCallback.call(o.userScope || this, [], o, false);
            }
            return;
        }

        if (result.success === false) {
            context.fireEvent("loadexception", context, {}, response, { message: result.msg });
            if (context.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, result.msg);
            }

            if (o && o.userCallback) {
                o.userCallback.call(o.userScope || this, [], o, false);
            }

            return;
        }

        if (p.refreshData) {
            if (result.data.data && result.data.data !== null) {
                p.refreshData(result.data.data);
                if (context.isPagingStore()) {
                    context.loadData(result.data.data);
                }
            } else {
                p.refreshData({});
                if (context.isPagingStore()) {
                    context.loadData({});
                }
            }
        }

        if (o && o.userCallback) {
            o.callback = o.userCallback;
            o.userCallback = undefined;
            o.scope = o.userScope;
            o.userScope = undefined;
        }

        if (!context.isPagingStore()) {
            context.silentMode = true;
            context.reload(o, true);
            context.silentMode = false;
        }
    },

    callbackErrorHandler : function (response, result, context, type, action, extraParams) {
        context.fireEvent("saveexception", context, {}, response, { message: result.errorMessage || response.statusText });

        if (context.showWarningOnFailure) {
            Coolite.AjaxEvent.showFailure(response, response.responseText);
        }
    },

    callbackRefreshErrorHandler : function (response, result, context, type, action, extraParams, o) {
        context.fireEvent("loadexception", context, {}, response, { message: result.errorMessage || response.statusText });

        if (context.showWarningOnFailure) {
            Coolite.AjaxEvent.showFailure(response, response.responseText);
        }

        if (o && o.userCallback) {
            o.userCallback.call(o.userScope || this, [], o, false);
        }
    },

    callbackSave : function (options) {
        var requestObject = this.prepareCallback(this, options);

        if (requestObject !== null) {
            var config = {},
                ac = this.ajaxEventConfig;

            ac.userSuccess = this.callbackHandler;
            ac.userFailure = this.callbackErrorHandler;
            ac.extraParams = requestObject.extraParams;
            ac.enforceFailureWarning = !this.hasListener("saveexception");

            Ext.apply(config, ac, {
                control   : this,
                eventType : "postback",
                action    : "update",
                serviceParams : requestObject.data
            });
            
            Coolite.AjaxEvent.request(config);
        }
    },

    submitData : function (data, options) {
        if (Ext.isEmpty(data)) {
            data = this.getRecordsValues(options);
        }

        if (Ext.isEmpty(this.updateProxy)) {
            options = { params: {} };
            if (this.fireEvent("beforesave", this, options) !== false) {

                var config = {}, ac = this.ajaxEventConfig;

                ac.userSuccess = this.submitSuccess;
                ac.userFailure = this.submitFailure;
                ac.extraParams = options.params;
                ac.enforceFailureWarning = !this.hasListener("saveexception");

                Ext.apply(config, ac, {
                    control   : this,
                    eventType : "postback",
                    action    : "submit",
                    serviceParams : Ext.encode(data)
                });

                Coolite.AjaxEvent.request(config);
            }
        } else {
            options = { params: {} };

            if (this.fireEvent("beforesave", this, options) !== false) {
                var p = Ext.apply(options.params || {}, { data: Ext.encode(data) });
                this.updateProxy.save(p, this.reader, this.finishSubmit, this, options);
            }
        }
    },

    finishSubmit : function (o, options, success) {
        if (!o || success === false) {

            if (success !== false) {
                this.fireEvent("save", this, options);
            }

            return;
        }

        var serverSuccess = o.success,
            msg = o.msg;

        if (!serverSuccess) {
            context.fireEvent("saveexception", this, options, {}, { message: msg });

            if (context.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure({ status: 200, statusText: "OK" }, msg);
            }

            return;
        }

        this.fireEvent("save", this, options);
    },

    submitFailure : function (response, result, context, type, action, extraParams) {
        context.fireEvent("saveexception", context, {}, response, { message: result.errorMessage || response.statusText });

        if (context.showWarningOnFailure) {
            Coolite.AjaxEvent.showFailure(response, response.responseText);
        }
    },

    submitSuccess : function (response, result, context, type, action, extraParams) {
        try {
            var responseObj = result.serviceResponse;
            result = { success: responseObj.Success, msg: responseObj.Msg };
        } catch (e) {
            context.fireEvent("saveexception", context, {}, response, e);

            if (context.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, e.message);
            }

            return;
        }

        if (!result.success) {
            context.fireEvent("saveexception", context, {}, response, { message: result.msg });

            if (context.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, result.msg);
            }

            return;
        }

        context.fireEvent("save", context, {});
    },

    callbackReload : function (dirtyConfirm, reloadOptions) {
        var options = Ext.applyIf(reloadOptions || {}, this.lastOptions);
        options.params = options.params || {};

        var reload = function (store, options) {
            if (store.fireEvent("beforeload", store, options) !== false) {
                store.storeOptions(options);
                store.deleted = [];
                store.modified = [];
            
                var config = {},
                    ac = store.ajaxEventConfig;

                ac.userSuccess = store.callbackRefreshHandler;
                ac.userFailure = store.callbackRefreshErrorHandler;
                ac.extraParams = options.params;
                ac.enforceFailureWarning = !store.hasListener("loadexception");
                config.userCallback = options.callback;
                config.userScope = options.scope;

                Ext.apply(config, ac, { 
                    control   : store, 
                    eventType : "postback", 
                    action    : "refresh" 
                });
                
                Coolite.AjaxEvent.request(config);
            }
        };

        if (dirtyConfirm && this.isDirty()) {
            Ext.MessageBox.confirm(
                this.dirtyWarningTitle,
                this.dirtyWarningText, function (btn, text) {
                    if (btn == "yes") {
                        reload(this, options);
                    }
                }, this);
        } else {
            reload(this, options);
        }
    },
    
    getAllRange : function (start, end) {
        return this.getRange(start, end);
    }
});

// @source data/PagingStore.js

Ext.ns("Ext.ux.data");

Ext.ux.data.PagingStore = Ext.extend(Coolite.Ext.Store, {
    destroy : function () {
        if (this.storeId || this.id) {
            Ext.StoreMgr.unregister(this);
        }
        
        delete this.data;
        delete this.allData;
        delete this.snapshot;
        this.purgeListeners();
    },
    
    add : function (records) {
        records = [].concat(records);
        
        if (records.length < 1) {
            return;
        }
        
        for (var i = 0, len = records.length; i < len; i++) {
            records[i].join(this);
        }
        
        var index = this.data.length;
        this.data.addAll(records);
        
        if (this.allData) {
            this.allData.addAll(records);
        }
        
        if (this.snapshot) {
            this.snapshot.addAll(records);
        }
        
        this.fireEvent("add", this, records, index);
    },
    
    remove : function (record) {
        var index = this.data.indexOf(record);
        this.data.removeAt(index);
        
        if (this.allData) {
            this.allData.remove(record);
        }
        
        if (this.snapshot) {
            this.snapshot.remove(record);
        }
        
        if (this.pruneModifiedRecords) {
            this.modified.remove(record);
        }

        if (!record.newRecord) {
            this.deleted.push(record);
        }

        this.fireEvent("remove", this, record, index);
    },
    
    removeAll : function () {
        this.data.clear();
        
        if (this.allData) {
            this.allData.clear();
        }
        
        if (this.snapshot) {
            this.snapshot.clear();
        }
        
        if (this.pruneModifiedRecords) {
            this.modified = [];
        }
        
        this.fireEvent("clear", this);
    },
    
    insert : function (index, records) {
        records = [].concat(records);
        
        for (var i = 0, len = records.length; i < len; i++) {
            this.data.insert(index, records[i]);
            records[i].join(this);
        }
        
        if (this.allData) {
            this.allData.addAll(records);
        }
        
        if (this.snapshot) {
            this.snapshot.addAll(records);
        }
        
        this.fireEvent("add", this, records, index);
    },
    
    getById : function (id) {
        return (this.snapshot || this.allData || this.data).key(id);
    },
    
    load : function (options) {
        options = options || {};
        
        if (this.fireEvent("beforeload", this, options) !== false) {
            this.storeOptions(options);
            var p = Ext.apply({}, options.params, this.baseParams);
            
            if (this.sortInfo && this.remoteSort) {
                var pn = this.paramNames;
                
                p[pn.sort] = this.sortInfo.field;
                p[pn.dir] = this.sortInfo.direction;
            }
            
            if (this.isPaging(p)) {
                (function () {
                    if (this.allData) {
                        this.data = this.allData;
                        delete this.allData;
                    }
        
                    this.applyPaging();
                    this.fireEvent("datachanged", this);
                    var r = [].concat(this.data.items);
                    this.fireEvent("load", this, r, options);
        
                    if (options.callback) {
                        options.callback.call(options.scope || this, r, options, true);
                    }
                }).defer(1, this);
        
                return true;
            }
            
            this.proxy.load(p, this.reader, this.loadRecords, this, options);
        
            return true;
        } else {
            return false;
        }
    },
    
    loadRecords : function (o, options, success) {
        if (!o || success === false) {
            if (success !== false) {
                this.fireEvent("load", this, [], options);
            }
            
            if (options.callback) {
                options.callback.call(options.scope || this, [], options, false);
            }
            
            return;
        }
        var r = o.records, t = o.totalRecords || r.length;
        
        if (!options || options.add !== true) {
            if (this.pruneModifiedRecords) {
                this.modified = [];
            }
            
            for (var i = 0, len = r.length; i < len; i++) {
                r[i].join(this);
            }
            
            if (this.allData) {
                this.data = this.allData;
                delete this.allData;
            }
            
            if (this.snapshot) {
                this.data = this.snapshot;
                delete this.snapshot;
            }
            
            this.data.clear();
            this.data.addAll(r);
            this.totalLength = t;
            this.applySort();
            
            if (!this.allData) {
                this.applyPaging();
            }
            
            if (r.length != this.getCount()) {
                r = [].concat(this.data.items);
            }
            
            this.fireEvent("datachanged", this);
        } else {
            this.totalLength = Math.max(t, this.data.length + r.length);
            this.add(r);
        }
        this.fireEvent("load", this, r, options);
        
        if (options.callback) {
            options.callback.call(options.scope || this, r, options, true);
        }
    },
    
    loadData : function (o, append) {
        this.isPaging(Ext.apply({}, this.lastOptions ? this.lastOptions.params : null, this.baseParams));
        var r = this.reader.readRecords(o);
        this.loadRecords(r, { add: append }, true);
    },
    
    getTotalCount : function () {
        return this.allData ? this.allData.getCount() : this.totalLength || 0;
    },
    
    sortData : function (f, direction) {
        direction = direction || "ASC";
        var st = this.fields.get(f).sortType,
            fn = function (r1, r2) {
                var v1 = st(r1.data[f]), v2 = st(r2.data[f]);
                return v1 > v2 ? 1 : (v1 < v2 ? -1 : 0);
            };
        
        if (this.allData) {
            this.data = this.allData;
            delete this.allData;
        }
        
        this.data.sort(direction, fn);
        
        if (this.snapshot && this.snapshot != this.data) {
            this.snapshot.sort(direction, fn);
        }
        
        this.applyPaging();
    },
    
    filterBy : function (fn, scope) {
        this.snapshot = this.snapshot || this.allData || this.data;
        delete this.allData;
        this.data = this.queryBy(fn, scope || this);
        this.applyPaging();
        this.fireEvent("datachanged", this);
    },
    
    queryBy : function (fn, scope) {
        var data = this.snapshot || this.allData || this.data;
        
        return data.filterBy(fn, scope || this);
    },
    
    collect : function (dataIndex, allowNull, bypassFilter) {
        var d = (bypassFilter === true ? this.snapshot || this.allData || this.data : this.data).items,
            v, 
            sv, 
            r = [], 
            l = {};
        
        for (var i = 0, len = d.length; i < len; i++) {
            v = d[i].data[dataIndex];
            sv = String(v);
            
            if ((allowNull || !Ext.isEmpty(v)) && !l[sv]) {
                l[sv] = true;
                r[r.length] = v;
            }
        }
        
        return r;
    },
    
    clearFilter : function (suppressEvent) {
        if (this.isFiltered()) {
            this.data = this.snapshot;
            delete this.allData;
            delete this.snapshot;
            this.applyPaging();
            
            if (suppressEvent !== true) {
                this.fireEvent("datachanged", this);
            }
        }
    },
    
    isFiltered : function () {
        return this.snapshot && this.snapshot != (this.allData || this.data);
    },
    
    isPaging : function (params) {
        var pn = this.paramNames, start = params[pn.start], limit = params[pn.limit];
        
        if ((typeof start != "number") || (typeof limit != "number")) {
            delete this.start;
            delete this.limit;
            this.lastParams = params;
            return false;
        }
        
        this.start = start;
        this.limit = limit;
        delete params[pn.start];
        delete params[pn.limit];
        var lastParams = this.lastParams;
        this.lastParams = params;
        
        if (!this.proxy) {
            return true;
        }
        
        if (!lastParams) {
            return false;
        }
        
        for (var param in params) {
            if (params.hasOwnProperty(param) && (params[param] !== lastParams[param])) {
                return false;
            }
        }
        
        for (param in lastParams) {
            if (lastParams.hasOwnProperty(param) && (params[param] !== lastParams[param])) {
                return false;
            }
        }
        
        return true;
    },
    
    applyPaging : function () {
        var start = this.start, 
            limit = this.limit;
        
        if ((typeof start == "number") && (typeof limit == "number")) {
            var allData = this.data, data = new Ext.util.MixedCollection(allData.allowFunctions, allData.getKey);
            data.items = allData.items.slice(start, start + limit);
            data.keys = allData.keys.slice(start, start + limit);
            
            var len = data.length = data.items.length,
                map = {};
            
            for (var i = 0; i < len; i++) {
                var item = data.items[i];
                map[data.getKey(item)] = item;
            }
            
            data.map = map;
            this.allData = allData;
            this.data = data;
        }
    },

    getAllRange : function (start, end) {
        return (this.snapshot || this.allData || this.data).getRange(start, end);
    },

    findPage : function (record) {
        if ((typeof this.limit == "number")) {
            return Math.ceil((this.snapshot || this.allData || this.data).indexOf(record) / this.limit);
        }

        return -1;
    },

    openPage : function (pageIndex, callback) {
        if ((typeof pageIndex != "number")) {
            pageIndex = this.findPage(pageIndex);
        }

        this.load({
            params : {
                start : (pageIndex - 1) * this.limit, 
                limit : this.limit
            }, 
            callback : callback
        });
    }
});

// @source data/SaveMask.js

Coolite.Ext.SaveMask = function (el, config) {
    this.el = Ext.get(el);
    
    Ext.apply(this, config);
    
    if (this.writeStore) {
        this.writeStore.on("beforesave", this.onBeforeSave, this);
        this.writeStore.on("save", this.onSave, this);
        this.writeStore.on("saveexception", this.onSave, this);
        this.writeStore.on("commitdone", this.onSave, this);
        this.writeStore.on("commitfailed", this.onSave, this);
        this.removeMask = Ext.value(this.removeMask, false);
    }
};

Coolite.Ext.SaveMask.prototype = {
    msg      : "Saving...",
    msgCls   : "x-mask-loading",
    disabled : false,
    
    disable  : function () {
        this.disabled = true;
    },
    
    enable : function () {
        this.disabled = false;
    },

    onSave : function () {
        this.el.unmask(this.removeMask);
    },

    onBeforeSave : function () {
        if (!this.disabled) {
            this.el.mask(this.msg, this.msgCls);
        }
    },

    show : function () {
        this.onBeforeSave();
    },

    hide : function () {
        this.onSave();    
    },

    destroy : function () {
        if (this.writeStore) {
            this.writeStore.un("beforesave", this.onBeforeSave, this);
            this.writeStore.un("save", this.onSave, this);
            this.writeStore.un("saveexception", this.onSave, this);
            this.writeStore.un("commitdone", this.onSave, this);
            this.writeStore.un("commitfailed", this.onSave, this);
        }
    }
};

// @source data/RowSelectionModel.js

Ext.grid.RowSelectionModel.prototype.handleMouseDown = Ext.grid.RowSelectionModel.prototype.handleMouseDown.createInterceptor(function (g, rowIndex, e) {
    if (e.button !== 0 || this.isLocked()) {
        return;
    }
    
    if (!e.shiftKey && !e.ctrlKey && this.getCount() > 1) { 
        this.clearSelections(); 
        this.selectRow(rowIndex, false); 
    }
});

// @source data/GridPanel.js

Coolite.Ext.GridPanel = function (config) {
    this.selectedIds = {};
    this.memoryIDField = "id";

    //Ext.apply(this, config);
    this.addEvents("editcompleted", "command", "groupcommand");
    Coolite.Ext.GridPanel.superclass.constructor.call(this, config);
    this.initSelection();    
};

Ext.extend(Coolite.Ext.GridPanel, Ext.grid.EditorGridPanel, {
    clearEditorFilter : true,
    selectionSavingBuffer : 0,
    
    getFilterPlugin : function () {
        if (this.plugins && Ext.isArray(this.plugins)) {
            for (var i = 0; i < this.plugins.length; i++) {
                if (this.plugins[i].isGridFiltersPlugin) {
                    return this.plugins[i];
                }
            }
        } else {
            if (this.plugins && this.plugins.isGridFiltersPlugin) {
                return this.plugins;
            }
        }
    },

    doSelection : function () {
        var data = this.selModel.selectedData,
            silent = true;

        if (!Ext.isEmpty(this.fireSelectOnLoad)) {
            silent = !this.fireSelectOnLoad;
        }

        if (!Ext.isEmpty(data)) {
            if (silent) {
                this.suspendEvents();
                this.selModel.suspendEvents();
            }

            if (this.selModel.select) {
                if (!Ext.isEmpty(data.recordID) && !Ext.isEmpty(data.name)) {
                    var rowIndex = this.store.indexOfId(data.recordID),
                        colIndex = this.getColumnModel().findColumnIndex(data.name);

                    if (rowIndex > -1 && colIndex > -1) {
                        this.selModel.select(rowIndex, colIndex);
                    }
                } else if (!Ext.isEmpty(data.rowIndex) && !Ext.isEmpty(data.colIndex)) {
                    this.selModel.select(data.rowIndex, data.colIndex);
                }

                if (silent) {
                    this.updateCellSelection();
                }
            }
            else if (this.selModel.selectRow && data.length > 0) {
                var records = [],
                    record;

                for (var i = 0; i < data.length; i++) {
                    if (!Ext.isEmpty(data[i].recordID)) {
                        record = this.store.getById(data[i].recordID);

                        if (this.selectionMemory) {
                            var idx = data[i].rowIndex || -1;

                            if (!Ext.isEmpty(record)) {
                                idx = this.store.indexOfId(record.id);
                                idx = this.getAbsoluteIndex(idx);
                            }

                            this.onMemorySelectId(null, idx, data[i].recordID);
                        }
                    }
                    else if (!Ext.isEmpty(data[i].rowIndex)) {
                        record = this.store.getAt(data[i].rowIndex);

                        if (this.selectionMemory && !Ext.isEmpty(record)) {
                            this.onMemorySelectId(null, data[i].rowIndex, record.id);
                        }
                    }

                    if (!Ext.isEmpty(record)) {
                        records.push(record);
                    }
                }
                this.selModel.selectRecords(records);

                if (silent) {
                    this.updateSelectedRows();
                }
            }

            if (silent) {
                this.resumeEvents();
                this.selModel.resumeEvents();
            }
        }
    },

    updateSelectedRows : function () {
        var records = [];

        if (this.selectionMemory) {
            for (var id in this.selectedIds) {
                records.push({ RecordID: this.selectedIds[id].id, RowIndex: this.selectedIds[id].index });
            }
        } else {
            var selectedRecords = this.selModel.getSelections();

            for (var i = 0; i < selectedRecords.length; i++) {
                records.push({ RecordID: selectedRecords[i].id, RowIndex: this.store.indexOfId(selectedRecords[i].id) });
            }
        }

        this.hField.setValue(Ext.encode(records));
    },

    updateCellSelection : function (sm, selection) {
        if (selection === null) {
            this.hField.setValue("");
        }
    },

    cellSelect : function (sm, rowIndex, colIndex) {
        var r = this.store.getAt(rowIndex),
            selection = {
                record: r,
                cell: [rowIndex, colIndex]
            },
            name = this.getColumnModel().getDataIndex(selection.cell[1]),
            value = selection.record.get(name),
            id = selection.record.id || "";

        this.hField.setValue(Ext.encode({ RecordID: id, Name: name, SubmittedValue: value, RowIndex: selection.cell[0], ColIndex: selection.cell[1] }));
    },

    selectionMemory : true,
    
    //private
    removeOrphanColumnPlugins : function (column) {
        var p, 
            i = 0;
        
        while (i < this.plugins.length) {
            p = this.plugins[i];
            
            if (p.isColumnPlugin) {
                if (this.getColumnModel().config.indexOf(p) === -1) {
                    this.plugins.remove(p);
                   
                    if (p.destroy) {
                        p.destroy();
                    }
                } else {
                    i++;
                }
            } else {
                i++;
            }
        }
    },

    addColumnPlugins : function (plugins, init) {        
        if (Ext.isArray(plugins)) {
            for (var i = 0; i < plugins.length; i++) {
                
                this.plugins.push(plugins[i]);
                
                if (init && plugins[i].init) {
                    plugins[i].init(this);
                }
            }
        } else {            
            this.plugins.push(plugins);
            
            if (init && plugins.init) {
                plugins.init(this);
            }
        }
    },

    initColumnPlugins : function (plugins, init) {
        var cp = [],
            p;
            
        this.initGridPlugins();
        
        if (init) {
            this.removeOrphanColumnPlugins();
        }    
        
        for (var i = 0; i < plugins.length; i++) {
            p = this.getColumnModel().config[plugins[i]];
            p.isColumnPlugin = true;
            cp.push(p);
        }
        
        this.addColumnPlugins(cp, init);
    },
    
    initGridPlugins : function () {
        if (Ext.isEmpty(this.plugins)) {
            this.plugins = [];
        } else if (!Ext.isArray(this.plugins)) {
            this.plugins = [this.plugins];
        }
    },

    initComponent : function () {
        Coolite.Ext.GridPanel.superclass.initComponent.call(this);
        
        this.initGridPlugins();

        if (this.columnPlugins) {
            this.initColumnPlugins(this.columnPlugins, false);
        }

        var cm = this.getColumnModel();

        for (var j = 0; j < cm.config.length; j++) {
            var column = cm.config[j];
            
            if (column.commands) {
                this.addColumnPlugins([new Coolite.Ext.CellCommands()]);
                break;
            }
        }

        if (this.selectionMemory) {
            this.selModel.on("rowselect", this.onMemorySelect, this);
            this.selModel.on("rowdeselect", this.onMemoryDeselect, this);
            this.store.on("remove", this.onStoreRemove, this);
            this.getView().on("refresh", this.memoryReConfigure, this);
        }

        if (!this.record && this.store) {
            this.record = this.store.recordType;
        }

        if (this.disableSelection) {
            if (this.selModel.select) {
                this.selModel.select = Ext.emptyFn;
            } else if (this.selModel.selectRow) {
                this.selModel.selectRow = Ext.emptyFn;
            }
        }

        if (this.store) {
            if (this.store.getCount() > 0) {
                this.on("render", this.doSelection, this, { single: true, delay: 100 });
            } else {
                this.store.on("load", this.doSelection, this, { single: true, delay: 100 });
            }
        }

        if (this.getView().headerRows) {
            this.enableColumnMove = false;

            for (var rowIndex = 0; rowIndex < this.view.headerRows.length; rowIndex++) {
                var cols = this.view.headerRows[rowIndex].columns;

                for (var colIndex = 0; colIndex < cols.length; colIndex++) {
                    var col = cols[colIndex];

                    if (Ext.isEmpty(col.component)) {
                        continue;
                    }

                    if (Ext.isArray(col.component) && col.component.length > 0) {
                        col.component = col.component[0];
                    }

                    col.component = col.component.render ? col.component : Ext.ComponentMgr.create(col.component, "panel");
                }
            }
        }

        if (this.clearEditorFilter) {
            this.on("beforeedit", function (e) {
                var ed = this.getColumnModel().config[e.column].editor;
                
                if (!Ext.isEmpty(ed) && ed.field && ed.field.store && ed.field.store.clearFilter) {
                    ed.field.store.clearFilter();
                }
            }, this);
        }
    },

    

    clearMemory : function () {
        delete this.selModel.selectedData;
        this.selectedIds = {};
        this.hField.setValue("");
    },

    memoryReConfigure : function () {
        this.store.on("clear", this.onMemoryClear, this);
        this.store.on("datachanged", this.memoryRestoreState, this);
    },

    onMemorySelect : function (sm, idx, rec) {
        if (this.getSelectionModel().singleSelect) {
            this.clearMemory();
        }
		var id = this.getRecId(rec),
            absIndex = this.getAbsoluteIndex(idx);

        this.onMemorySelectId(sm, absIndex, id);
    },

    onMemorySelectId : function (sm, index, id) {
        var obj = { id: id, index: index };
        this.selectedIds[id] = obj;
    },

    getAbsoluteIndex : function (pageIndex) {
        var absIndex = pageIndex;

        if (!Ext.isEmpty(this.pbarID)) {
            if (!this.pbar) {
                this.pbar = Ext.getCmp(this.pbarID);
            }
            absIndex = ((this.pbar.getPageData().activePage - 1) * this.pbar.pageSize) + pageIndex;
        }

        return absIndex;
    },

    onMemoryDeselect : function (sm, idx, rec) {
        delete this.selectedIds[this.getRecId(rec)];
    },

    onStoreRemove : function (store, rec, idx) {
        this.onMemoryDeselect(null, idx, rec);
    },

    memoryRestoreState : function () {
        if (this.store !== null) {
            var i = 0,
                sel = [],
                all = true,
                silent = true;

            this.store.each(function (rec) {
                var id = this.getRecId(rec);

                if (!Ext.isEmpty(this.selectedIds[id])) {
                    sel.push(i);
                } else {
                    all = false;
                }

                ++i;
            }, this);

            if (!Ext.isEmpty(this.fireSelectOnLoad)) {
                silent = !this.fireSelectOnLoad;
            }

            if (sel.length > 0) {
                if (silent) {
                    this.suspendEvents();
                    this.selModel.suspendEvents();
                }

                this.selModel.selectRows(sel);

                if (silent) {
                    this.resumeEvents();
                    this.selModel.resumeEvents();
                }
            }

            if (this.selModel.checkHeader) {
                if (all) {
                    this.selModel.checkHeader();
                } else {
                    this.selModel.uncheckHeader();
                }
            }
        }
    },

    getRecId : function (rec) {
        var id = rec.get(this.memoryIDField);

        if (Ext.isEmpty(id)) {
            id = rec.id;
        }

        return id;
    },

    onMemoryClear : function () {
        this.selectedIds = {};
    },

    

    getSelectionModelField : function () {
        if (!this.selectionModelField) {
            this.selectionModelField = new Ext.form.Hidden({ id: this.id + "_SM", name: this.id + "_SM" });
        }

        return this.selectionModelField;
    },

    initSelection : function () {
        this.hField = this.getSelectionModelField();

        if (this.selModel.select) {
            this.selModel.on("cellselect", this.cellSelect, this);
            this.selModel.on("selectionchange", this.updateCellSelection, this);
        } else if (this.selModel.selectRow) {
            this.selModel.on("selectionchange", this.updateSelectedRows, this, {buffer: this.selectionSavingBuffer});
            this.selModel.on("rowdeselect", this.updateSelectedRows, this, {buffer: this.selectionSavingBuffer});
            this.store.on("remove", this.updateSelectedRows, this, {buffer: this.selectionSavingBuffer});
        }
    },

    getKeyMap : function () {
        if (!this.keyMap) {
            this.keyMap = new Ext.KeyMap(this.view.el, this.keys);
        }

        return this.keyMap;
    },

    onRender : function (ct, position) {
        Coolite.Ext.GridPanel.superclass.onRender.call(this, ct, position);

        this.getSelectionModelField().render(this.el.parent() || this.el);

        if (this.menu instanceof Ext.menu.Menu) {
            this.on("contextmenu", this.showContextMenu);
            this.on("rowcontextmenu", this.onRowContextMenu);
        }

        this.relayEvents(this.selModel, ["rowselect", "rowdeselect"]);
        this.relayEvents(this.store, ["commitdone", "commitfailed"]);

        if (Ext.isEmpty(this.keyMap)) {
            this.keymap = new Ext.KeyMap(this.view.el, {
                key: [13, 35, 36],
                scope: this,
                fn: this.handleKeys
            });
        }

        if (this.view.headerRows) {
            this.on("resize", this.syncHeaders);
            this.on("columnresize", this.syncHeaders);
            this.colModel.on("hiddenchange", this.onHeaderRowHiddenChange, this);

            for (var rowIndex = 0; rowIndex < this.view.headerRows.length; rowIndex++) {
                var cols = this.view.headerRows[rowIndex].columns,
                    tr = this.view.mainHd.child("tr.x-grid3-hd-row-r" + rowIndex);

                for (var colIndex = 0; colIndex < cols.length; colIndex++) {
                    var col = cols[colIndex], div;
                    if (!Ext.isEmpty(col.component)) {
                        div = Ext.fly(tr.dom.cells[colIndex]).child("div.x-grid3-hd-inner");
                        col.component.render(div);
                    } else if (!Ext.isEmpty(col.target)) {
                        var cmp = Ext.getCmp(col.target.id || "");
                        div = Ext.fly(tr.dom.cells[colIndex]).child("div.x-grid3-hd-inner");

                        if (!Ext.isEmpty(cmp) && cmp.initTrigger) {
                            div.dom.appendChild(cmp.wrap.dom);
                        } else {
                            div.dom.appendChild(col.target.dom);
                        }
                    }
                }
            }
            this.syncHeaders.defer(100, this);
            
            var cm = this.getColumnModel();
            for (var i = 0; i < cm.columns.length; i++) {
                if (cm.isHidden(i)) {
                    this.onHeaderRowHiddenChange(cm, i, true);
                }                
            }
        }
    },

    onHeaderRowHiddenChange : function (cm, colIndex, hidden) {
        var display = hidden ? 'none' : '';

        for (var rowIndex = 0; rowIndex < this.view.headerRows.length; rowIndex++) {
            var cols = this.view.headerRows[rowIndex].columns,
                tr = this.view.mainHd.child("tr.x-grid3-hd-row-r" + rowIndex);

            Ext.fly(tr.dom.cells[colIndex]).dom.style.display = display;
        }
        this.syncHeaders.defer(100, this);
    },

    syncHeaders : function () {
        for (var rowIndex = 0; rowIndex < this.view.headerRows.length; rowIndex++) {
            var cols = this.view.headerRows[rowIndex].columns;

            for (var colIndex = 0; colIndex < cols.length; colIndex++) {
                var col = cols[colIndex],
                    cmp = undefined;

                if (!Ext.isEmpty(col.component)) {
                    cmp = col.component;
                } else if (!Ext.isEmpty(col.target)) {
                    cmp = Ext.getCmp(col.target.id || "");
                } else {
                    continue;
                }

                if (col.autoWidth !== false) {
                    var autoCorrection = Ext.isEmpty(col.correction) ? 3 : col.correction;

                    if (Ext.isIE && !Ext.isEmpty(cmp)) {
                        autoCorrection -= 1;
                    }

                    if (!Ext.isEmpty(cmp) && cmp.setSize) {
                        cmp.setSize(this.getColumnModel().getColumnWidth(colIndex) - autoCorrection);
                    } else {
                        col.target.setSize(this.getColumnModel().getColumnWidth(colIndex) - autoCorrection, col.target.getSize().height);
                    }
                }
            }
        }
    },

    onEditComplete : function (ed, value, startValue) {
        Coolite.Ext.GridPanel.superclass.onEditComplete.call(this, ed, value, startValue);

        ed.field.reset();

        if (!ed.record.dirty && ed.record.firstEdit) {
            this.store.remove(ed.record);
        }    

        delete ed.record.firstEdit;
        this.fireEvent("editcompleted", ed, value, startValue);
    },

    onRowContextMenu : function (grid, rowIndex, e) {
        e.stopEvent();

        if (!this.selModel.isSelected(rowIndex)) {
            this.selModel.selectRow(rowIndex);
            this.fireEvent("rowclick", this, rowIndex, e);
        }

        this.showContextMenu(e, rowIndex);
    },

    showContextMenu : function (e, rowIndex) {
        e.stopEvent();

        if (rowIndex === undefined) {
            this.selModel.clearSelections();
        }

        if (this.menu) {
            this.menu.showAt(e.getXY());
        }
    },

    handleKeys : function (key, e) {
        e.stopEvent();

        switch (key) {
        case 13:  // return key
            var rowIndex = this.selModel.last;
            var keyEvent = (e.shiftKey === true) ? "rowdblclick" : "rowclick";
            this.fireEvent(keyEvent, this, rowIndex, e);
            break;
        case 35:  // end key
            if (this.store.getCount() > 0) {
                this.selModel.selectLastRow();
                this.getView().focusRow(this.store.getCount() - 1);
            }
            break;
        case 36:  // home key
            if (this.store.getCount() > 0) {
                this.selModel.selectFirstRow();
                this.getView().focusRow(0);
            }
            break;
        }
    },

    reload : function (options) {
        this.store.reload(options);
    },

    isDirty : function () {
        if (this.store.modified.length > 0 || this.store.deleted.length > 0) {
            return true;
        }

        return false;
    },

    hasSelection : function () {
        return this.selModel.hasSelection();
    },

    addRecord : function (values) {
        this.store.clearFilter(false);
        
        var rowIndex = this.store.data.length;

        this.insertRecord(rowIndex, values);
        
        return rowIndex;
    },

    addRecordEx : function (values) {
        this.store.clearFilter(false);
        
        var rowIndex = this.store.data.length,
            record = this.insertRecord(rowIndex, values);

        return { index : rowIndex, record : record };
    },

    insertRecord : function (rowIndex, values) {
        if (arguments.length === 0) {
            this.insertRecord(0, {});
            this.getView().focusRow(0);
            this.startEditing(0, 0);
            return;
        }
        
        this.store.clearFilter(false);
        
        var f = this.record.prototype.fields,
            dv = {},
            i,
            v;
            
        values = values || {};
        
        for (i = 0; i < f.length; i++) {
            dv[f.items[i].name] = f.items[i].defaultValue;
        }

        var record = new this.record(dv, values[this.store.metaId()]);

        record.firstEdit = true;
        record.newRecord = true;
        this.stopEditing();
        this.store.insert(rowIndex, record);

        for (v in values) {
            record.set(v, values[v]);
        }

        if (!Ext.isEmpty(this.store.metaId())) {
            record.set(this.store.metaId(), record.id);
        }

        return record;
    },

    deleteRecord : function (record) {
        this.store.remove(record);
    },

    deleteSelected : function () {
        var s = this.selModel.getSelections(),
            i;

        for (i = 0, len = s.length; i < len; i++) {
            this.deleteRecord(s[i]);
        }
    },

    load : function (options) {
        this.store.load(options);
    },

    save : function (options) {
        if (options && options.visibleOnly) {
            options.grid = this;
        }
        
        this.stopEditing(false);

        this.store.save(options);
    },

    clear : function () {
        this.store.removeAll();
    },

    saveMask : false,

    initEvents : function () {
        Coolite.Ext.GridPanel.superclass.initEvents.call(this);

        if (this.saveMask) {
            this.saveMask = new Coolite.Ext.SaveMask(this.bwrap,
                    Ext.apply({ writeStore: this.store }, this.saveMask));
        }
    },

    reconfigure : function (store, colModel) {
        Coolite.Ext.GridPanel.superclass.reconfigure.call(this, store, colModel);

        if (this.saveMask) {
            this.saveMask.destroy();
            this.saveMask = new Coolite.Ext.SaveMask(this.bwrap,
                    Ext.apply({ writeStore: store }, this.initialConfig.saveMask));
        }
    },

    onDestroy : function () {
        if (this.rendered) {
            if (this.saveMask) {
                this.saveMask.destroy();
            }
        }

        Coolite.Ext.GridPanel.superclass.onDestroy.call(this);
    },

    insertColumn : function (index, newCol) {
        var c = this.getColumnModel().config;

        if (index >= 0) {
            c.splice(index, 0, newCol);
        }

        Ext.apply(c, { events: this.getColumnModel().events, ajaxEvents: this.getColumnModel().ajaxEvents });

        this.reconfigure(this.store, new Ext.grid.ColumnModel(c));
    },

    addColumn : function (newCol) {
        var c = this.getColumnModel().config;

        c.push(newCol);

        Ext.apply(c, { events: this.getColumnModel().events, ajaxEvents: this.getColumnModel().ajaxEvents });

        this.reconfigure(this.store, new Ext.grid.ColumnModel(c));
    },

    removeColumn : function (index) {
        var c = this.getColumnModel().config;

        if (index >= 0) {
            c.splice(index, 1);
        }

        Ext.apply(c, { events: this.getColumnModel().events, ajaxEvents: this.getColumnModel().ajaxEvents });

        var cm = new Ext.grid.ColumnModel(c);

        this.reconfigure(this.store, cm);
    },

    reconfigureColumns : function (cfg) {
        var oldCM = this.getColumnModel(),
            specialCols = ["checker", "expander"],
            i;

        Ext.apply(cfg, { events: oldCM.events, ajaxEvents: oldCM.ajaxEvents });

        for (i = 0; i < specialCols.length; i++) {
            var specCol = oldCM.getColumnById(specialCols[i]);

            if (!Ext.isEmpty(specCol)) {
                var index = oldCM.getIndexById(specialCols[i]);

                if (index !== 0 && index >= cfg.length) {
                    index = cfg.length - 1;
                }

                cfg.splice(index, 0, specCol);
            }
        }

        this.reconfigure(this.store, new Ext.grid.ColumnModel(cfg));
    },

    getRowsValues : function (selectedOnly, visibleOnly, dirtyOnly, currentPageOnly) {
        this.stopEditing(false);
        
        if (Ext.isEmpty(selectedOnly)) {
            selectedOnly = true;
        }

        var records = (selectedOnly ? this.selModel.getSelections() : currentPageOnly ? this.store.getRange() : this.store.getAllRange()) || [],
            record,
            values = [],
            i;
            
        if (this.selectionMemory && selectedOnly && !currentPageOnly && this.store.isPagingStore()) {
            records = [];
            for (var id in this.selectedIds) {                
                record = this.store.getById(this.selectedIds[id].id);
                if (!Ext.isEmpty(record)) {
                    records.push(record);
                }
            }
        }

        for (i = 0; i < records.length; i++) {
            var obj = {}, dataR;
            if (this.store.metaId()) {
                obj[this.store.metaId()] = records[i].id;
            }

            dataR = Ext.apply(obj, records[i].data);
            dataR = this.store.prepareRecord(dataR, records[i], { visibleOnly: visibleOnly, grid: this, dirtyOnly: dirtyOnly });

            if (!Ext.isEmptyObj(dataR)) {
                values.push(dataR);
            }
        }

        return values;
    },
    
    submitData : function (selectedOnly, visibleOnly, dirtyOnly, currentPageOnly) {
        this.store.submitData(this.getRowsValues(selectedOnly || false, visibleOnly, dirtyOnly, currentPageOnly));
    },
    
    stopEditing : function (cancel) {
        Coolite.Ext.GridPanel.superclass.stopEditing.call(this, cancel);
        var ae = this.activeEditor;
        
        if (ae) {
            ae.field.reset();
        }
    }
});

Ext.reg("coolitegrid", Coolite.Ext.GridPanel);

// @source data/GroupingView.js

Ext.grid.GroupingView.override({
    onRemove : function (ds, record, index, isUpdate) {
        Ext.grid.GroupingView.superclass.onRemove.apply(this, arguments);
        
        var g = document.getElementById(Ext.util.Format.htmlDecode(record._groupId));
        
        if (g && g.childNodes[1].childNodes.length < 1) {
            Ext.removeNode(g);
        }
        
        this.applyEmptyText();
    }
});

// @source data/PagingMemoryProxy.js

Ext.data.PagingMemoryProxy = function (data, isUrl) {
	Ext.data.PagingMemoryProxy.superclass.constructor.call(this);
	this.data = data;
	this.isUrl = isUrl || false;		
	this.isNeedRefresh = this.isUrl;
	this.url = this.isUrl ? data : "";	
};

Ext.extend(Ext.data.PagingMemoryProxy, Ext.data.MemoryProxy, {
    refreshData : function (data, store) {
        if (this.isUrl === true) {
            this.isNeedRefresh = true;
        } else {
            if (data && data !== null) {
                this.data = data;
            } else {
                store.callbackReload(store.warningOnDirty);
            }
        }
    },

    refreshByUrl : function (params, reader, callback, scope, arg) {
        var o = {
            method   : "GET",
            request  : {
                callback : callback,
                scope    : scope,
                arg      : arg,
                params   : params || {}
            },
            reader   : reader,
            url      : this.url,
            callback : this.loadResponse,
            scope    : this
        };

        if (this.activeRequest) {
            Ext.Ajax.abort(this.activeRequest);
        }

        this.activeRequest = Ext.Ajax.request(o);
    },

    loadResponse : function (o, success, response) {
        delete this.activeRequest;
        
        if (!success) {
            this.fireEvent("loadexception", this, o, response);
            o.request.callback.call(o.request.scope, null, o.request.arg, false);
            return;
        }

        try {
            if (o.reader.getJsonAccessor) {
                this.data = response.responseText;
            } else {
                this.data = response.responseXML;
            }

            if (!this.data) {
                throw { message : "The data doesn't available" };
            }
        } catch (e) {
            this.fireEvent("loadexception", this, o, response, e);
            o.request.callback.call(o.request.scope, null, o.request.arg, false);
            return;
        }

        this.isNeedRefresh = false;
        this.load(o.request.params, o.reader, o.request.callback, o.request.scope, o.request.arg);
    },

    load : function (params, reader, callback, scope, arg) {
        this.fireEvent("beforeload", this, params);
        
        params = params || {};

        if (this.isNeedRefresh === true) {
            this.refreshByUrl(params, reader, callback, scope, arg);
            return;
        }

        var result;
        
        try {
            result = reader.readRecords(this.data);
        } catch (e) {
            this.fireEvent("loadexception", this, arg, null, e);
            callback.call(scope, null, arg, false);
            return;
        }

        if (params.gridfilters !== undefined) {
            var r = [];
            for (var i = 0, len = result.records.length; i < len; i++) {
                if (params.gridfilters.call(this, result.records[i])) {
                    r.push(result.records[i]);
                }
            }
            result.records = r;
            result.totalRecords = result.records.length;
        }


        if (params.sort !== undefined) {
            var dir = String(params.dir).toUpperCase() == "DESC" ? -1 : 1,
                st = scope.fields.get(params.sort).sortType,
                fn = function (r1, r2) {
                    var v1 = st(r1), v2 = st(r2);
                    return v1 > v2 ? 1 : (v1 < v2 ? -1 : 0);
                };

            result.records.sort(function (a, b) {
                var v = 0;
                
                v = (typeof (a) == "object") ? fn(a.data[params.sort], b.data[params.sort]) * dir : fn(a, b) * dir;
                
                if (v === 0) {
                    v = (a.index < b.index ? -1 : 1);
                }
                
                return v;
            });
        }

        if (params.start !== undefined && params.limit !== undefined) {
            result.records = result.records.slice(params.start, params.start + params.limit);
        }

        callback.call(scope, result, arg, true);
    }
});

// @source data/PagingToolbar.js

Coolite.Ext.initRefreshPagingToolbar = function (grid) {
    var refresh = function (bBar) {
        for (i = 0; i < bBar.items.items.length; ++i) {
            var item = bBar.items.items[i];
            
            if (item.iconCls == "x-tbar-loading" && item.tooltip == bBar.refreshText) {
                item.setHandler(function () {
                    
                    if (grid.getStore().proxy.refreshData) {
                        grid.getStore().proxy.refreshData(null, grid.getStore());
                    }
                    
                    if (grid.getStore().proxy.isUrl) {
                        item.initialConfig.handler();
                    }
                });
                return true;
            }
        }
        return false;
    };

    var bar,
        bBar = grid.getBottomToolbar();
    
    if (bBar && bBar.changePage) {
        bar = bBar;
    } else {
        bar = grid.getTopToolbar();
    }

    if (bar.rendered) {
        refresh(bar);
    } else {
        bar.on("render", refresh.createDelegate(this, [bar], false));
    }
};

Ext.PagingToolbar.prototype.onRender = Ext.PagingToolbar.prototype.onRender.createSequence(function (el) {
    this.getActivePageField().render(this.el.parent() || this.el);
});

Ext.PagingToolbar.override({
    getActivePageField : function () {
        if (!this.activePageField) {
            this.activePageField = new Ext.form.Hidden({ id : this.id + "_ActivePage", name : this.id + "_ActivePage" });
        }
        
        return this.activePageField;
    }
});

// @source data/PropertyGrid.js

Coolite.Ext.PropertyGrid = function () {
    Coolite.Ext.PropertyGrid.superclass.constructor.call(this);	
	this.addEvents("beforesave", "save", "saveexception");
};

Coolite.Ext.PropertyGrid = Ext.extend(Ext.grid.PropertyGrid, {
    editable : true,
    
    getDataField : function () {
        if (!this.dataField) {
            this.dataField = new Ext.form.Hidden({ id : this.id + "_Data", name : this.id + "_Data" });
        }
        
        return this.dataField;
    },

    initComponent : function () {
        Coolite.Ext.PropertyGrid.superclass.initComponent.call(this);
        
        if (!this.editable) {
            this.on("beforeedit", function (e) {
                return false;
            });
        }
    },

    onRender : function () {
        Coolite.Ext.PropertyGrid.superclass.onRender.apply(this, arguments);
        this.getDataField().render(this.el.parent() || this.el);
    },

    callbackHandler : function (response, result, context, type, action, extraParams) {
        try {
            var responseObj = result.serviceResponse;
            result = { success : responseObj.Success, msg : responseObj.Msg || null };
        } catch (e) {
            context.fireEvent("saveexception", context, response, e);
            return;
        }

        if (result.success === false) {
            context.fireEvent("saveexception", context, response, { message : result.msg });
            return;
        }

        context.fireEvent("save", context, response);
    },

    callbackErrorHandler : function (response, result, context, type, action, extraParams) {
        context.fireEvent("saveexception", context, response, { message : result.errorMessage || response.statusText });
    },

    save : function () {
        var options = { params : {} };
        
        if (this.fireEvent("beforesave", this, options) !== false) {
            var config = {}, 
                ac = this.ajaxEventConfig;
                
            ac.userSuccess = this.callbackHandler;
            ac.userFailure = this.callbackErrorHandler;
            ac.extraParams = options.params;
            ac.enforceFailureWarning = !this.hasListener("saveexception");

            Ext.apply(config, ac, { control : this, eventType : "postback", action : "update", serviceParams : Ext.encode(this.getSource()) });
            Coolite.AjaxEvent.request(config);
        }
    }
});

Ext.reg("coolitepropertygrid", Coolite.Ext.PropertyGrid);

// @source data/ArrayReader.js

Ext.data.ArrayReader.override({
    isArrayReader : true
});

// @source data/DataSourceProxy.js

Coolite.Ext.DataSourceProxy = function () {
    Coolite.Ext.DataSourceProxy.superclass.constructor.call(this);
};

Ext.extend(Coolite.Ext.DataSourceProxy, Ext.data.DataProxy, {
    ro          : {},
    isDataProxy : true,
    load        : function (params, reader, callback, scope, arg) {
        if (this.fireEvent("beforeload", this, params) !== false) {
            this.ro = {
                params   : params || {},
                request  : {
                    callback : callback,
                    scope    : scope,
                    arg      : arg
                },
                reader   : reader,
                callback : this.loadResponse,
                scope    : this
            };

            var config = {}, 
                ac = scope.ajaxEventConfig;
                
            ac.userSuccess = this.successHandler;
            ac.userFailure = this.errorHandler;
            ac.extraParams = params;
            ac.enforceFailureWarning = !this.hasListener("loadexception");

            Ext.apply(config, ac, { control : scope, eventType : "postback", action : "refresh" });
            Coolite.AjaxEvent.request(config);
        } else {
            callback.call(scope || this, null, arg, false);
        }
    },

    successHandler : function (response, result, context, type, action, extraParams) {
        var p = context.proxy;

        try {
            var responseObj = result.serviceResponse;
            result = { success : responseObj.Success, msg : responseObj.Msg || null, data : responseObj.Data || {} };
        } catch (e) {
            context.fireEvent("loadexception", context, {}, response, e);
            p.ro.request.callback.call(p.ro.request.scope, null, p.ro.request.arg, false);
            if (p.ro.request.scope.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, e.message);
            }
            return;
        }

        if (result.success === false) {
            context.fireEvent("loadexception", context, {}, response, { message : result.msg });
            p.ro.request.callback.call(p.ro.request.scope, null, p.ro.request.arg, false);
            
            if (p.ro.request.scope.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, result.msg);
            }
            
            return;
        }

        try {
            var meta = p.ro.reader.meta;

            if (Ext.isEmpty(meta.totalProperty)) {
                meta.totalProperty = "totalCount";
            }

            if (Ext.isEmpty(meta.root)) {
                meta.root = "data";
            }

            if (Ext.isEmpty(result.data[meta.root])) {
                result.data[meta.root] = [];
            }

            if (p.ro.reader.isArrayReader) {
                result = p.ro.reader.readRecords(result.data.data);
            } else {
                result = p.ro.reader.readRecords(result.data);
            }

        } catch (ex) {
            p.fireEvent("loadexception", p, p.ro, response, ex);
            p.ro.request.callback.call(p.ro.request.scope, null, p.ro.request.arg, false);
            
            if (p.ro.request.scope.showWarningOnFailure) {
                Coolite.AjaxEvent.showFailure(response, ex.message);
            }
            
            return;
        }
        p.fireEvent("load", p, p.ro, p.ro.request.arg);
        p.ro.request.callback.call(p.ro.request.scope, result, p.ro.request.arg, true);

    },

    errorHandler : function (response, result, context, type, action, extraParams) {
        var p = context.proxy;
        
        p.fireEvent("loadexception", p, p.ro, response);
        p.ro.request.callback.call(p.ro.request.scope, null, p.ro.request.arg, false);
        
        if (p.ro.request.scope.showWarningOnFailure) {
            Coolite.AjaxEvent.showFailure(response, response.responseText);
        }
    }
});

// @source data/RowExpander.js

Ext.grid.RowExpander = function (config) {
    Ext.apply(this, config);

    this.addEvents({
        beforeexpand   : true,
        expand         : true,
        beforecollapse : true,
        collapse       : true
    });

    Ext.grid.RowExpander.superclass.constructor.call(this);

    if (this.tpl) {
        if (typeof this.tpl == "string") {
            this.tpl = new Ext.Template(this.tpl);
        }
    
        this.tpl.compile();
    }

    this.state = {};
    this.bodyContent = {};
    this.renderer = this.renderer.createDelegate(this);
};

Ext.extend(Ext.grid.RowExpander, Ext.util.Observable, {
    header        : "",
    width         : 20,
    sortable      : false,
    fixed         : true,
    menuDisabled  : true,
    dataIndex     : "",
    id            : "expander",
    lazyRender    : true,
    enableCaching : true,
    collapsed     : true,

    getRowClass   : function (record, rowIndex, p, ds) {
        p.cols = p.cols - 1;
        
        var content = this.bodyContent[record.id];
        
        if (!content && !this.lazyRender) {
            content = this.getBodyContent(record, rowIndex);
        }
        
        if (content) {
            p.body = content;
        }

        if (this.state[record.id] === undefined) {
            if (this.collapsed === false) {
                this.state[record.id] = true;
                
                if (this.tpl && this.lazyRender) {
                    p.body = this.getBodyContent(record, rowIndex);
                }         
                
                return "x-grid3-row-expanded";
            }
            return "x-grid3-row-collapsed";
        }

        return this.state[record.id] ? "x-grid3-row-expanded" : "x-grid3-row-collapsed";
    },

    init : function (grid) {
        this.grid = grid;

        var view = grid.getView();
        
        view.getRowClass = this.getRowClass.createDelegate(this);

        view.enableRowBody = true;

        grid.on("render", function () {
                view.mainBody.on("mousedown", this.onMouseDown, this);
            }, this);
    },

    getBodyContent : function (record, index) {
        if (!this.enableCaching) {
            return this.tpl.apply(record.data);
        }
        
        var content = this.bodyContent[record.id];
        
        if (!content) {
            content = this.tpl.apply(record.data);
            this.bodyContent[record.id] = content;
        }
        
        return content;
    },

    onMouseDown : function (e, t) {
        if (t.className == "x-grid3-row-expander") {
            e.stopEvent();
            var row = e.getTarget(".x-grid3-row");
            this.toggleRow(row);
        }
    },
    
    prepare : function (record) { },

    renderer : function (v, p, record) {
        p.cellAttr = 'rowspan="2"';
        return '<div class="' + (this.prepare(record) !== false ? "x-grid3-row-expander" : "") + '">&#160;</div>';
    },

    beforeExpand : function (record, body, rowIndex) {
        if (this.fireEvent("beforeexpand", this, record, body, rowIndex) !== false) {
            if (this.tpl && this.lazyRender) {
                body.innerHTML = this.getBodyContent(record, rowIndex);
            }
            
            return true;
        } else {
            return false;
        }
    },

    toggleRow : function (row) {
        if (typeof row == "number") {
            row = this.grid.view.getRow(row);
        }
        this[Ext.fly(row).hasClass("x-grid3-row-collapsed") ? "expandRow" : "collapseRow"](row);
    },

    expandRow : function (row) {
        if (typeof row == "number") {
            row = this.grid.view.getRow(row);
        }
        
        var record = this.grid.store.getAt(row.rowIndex),
            body = Ext.DomQuery.selectNode("tr div.x-grid3-row-body", row);
            
        if (this.beforeExpand(record, body, row.rowIndex)) {
            this.state[record.id] = true;
            Ext.fly(row).replaceClass("x-grid3-row-collapsed", "x-grid3-row-expanded");
            this.fireEvent("expand", this, record, body, row.rowIndex);
        }
    },

    collapseRow : function (row) {
        if (typeof row == "number") {
            row = this.grid.view.getRow(row);
        }
        
        var record = this.grid.store.getAt(row.rowIndex),
            body = Ext.fly(row).child("tr:nth(1) div.x-grid3-row-body", true);
            
        if (this.fireEvent("beforecollapse", this, record, body, row.rowIndex) !== false) {
            this.state[record.id] = false;
            Ext.fly(row).replaceClass("x-grid3-row-expanded", "x-grid3-row-collapsed");
            this.fireEvent("collapse", this, record, body, row.rowIndex);
        }
    }
});

// @source data/CheckColumn.js

Ext.grid.CheckColumn = function (config) {
    Ext.apply(this, config);
    
    if (!this.id) {
        this.id = Ext.id();
    }
    
    this.renderer = this.renderer.createDelegate(this);
};

Ext.grid.CheckColumn.prototype = {
    init : function (grid) {
        this.grid = grid;

        var view = grid.getView();

        if (view.mainBody) {
            view.mainBody.on("mousedown", this.onMouseDown, this);
        } else {
            this.grid.on("render", function () {
                this.grid.getView().mainBody.on("mousedown", this.onMouseDown, this);
            }, this);
        }
    },

    onMouseDown : function (e, t) {
        if (t.className && Ext.fly(t).hasClass("x-grid3-cc-" + this.dataIndex)) {
            e.stopEvent();

            var rIndex = this.grid.getView().findRowIndex(t),
                record = this.grid.store.getAt(rIndex);

            var ev = {
                grid   : this.grid,
                record : record,
                field  : this.dataIndex,
                value  : record.data[this.dataIndex],
                row    : rIndex,
                column : this.grid.getColumnModel().findColumnIndex(this.dataIndex),
                cancel : false
            };
            
            if (this.grid.fireEvent("beforeedit", ev) === false || ev.cancel === true) {
                return;
            }

            ev.originalValue = ev.value;
            ev.value = !record.data[this.dataIndex];

            if (this.grid.fireEvent("validateedit", ev) === false || ev.cancel === true) {
                return;
            }

            record.set(this.dataIndex, !record.data[this.dataIndex]);

            this.grid.fireEvent("afteredit", ev);
        }
    },

    renderer : function (v, p, record) {
        p.css += " x-grid3-check-col-td";
        return '<div class="x-grid3-check-col' + (v ? "-on" : "") + " x-grid3-cc-" + this.dataIndex + '">&#160;</div>';
    },
    
    destroy : function () {
        this.grid.getView().mainBody.un("mousedown", this.onMouseDown, this);
    }
};

// @source data/TableGrid.js

Ext.grid.TableGrid = function (config) {
    config = config || {};
    
    Ext.apply(this, config);
    
    var cf = config.fields || [], ch = config.columns || [],
        i,
        h;

    if (config.table.isComposite) {
        if (config.table.elements.length > 0) {
            table = Ext.get(config.table.elements[0]);
        }
    } else {
        table = Ext.get(config.table);
    }

    var ct = table.insertSibling();
    
    if (!Ext.isEmpty(config.id)) {
        ct.id = config.id;
    }

    var fields = [], cols = [],
        headers = table.query("thead th");
        
    for (i = 0; i < headers.length; i++) {
        h = headers[i];
        var text = h.innerHTML,
            name = "tcol-" + i;

        fields.push(Ext.applyIf(cf[i] || {}, {
            name    : name,
            mapping : "td:nth(" + (i + 1) + ")/@innerHTML"
        }));

        cols.push(Ext.applyIf(ch[i] || {}, {
            "header"    : text,
            "dataIndex" : name,
            "width"     : h.offsetWidth,
            "tooltip"   : h.title,
            "sortable"  : true
        }));
    }

    var ds = new Ext.data.Store({
        reader : new Ext.data.XmlReader({
            record : "tbody tr"
        }, fields)
    });

    ds.loadData(table.dom);

    var cm = new Ext.grid.ColumnModel(cols);

    if (config.width || config.height) {
        ct.setSize(config.width || "auto", config.height || "auto");
    } else {
        ct.setWidth(table.getWidth());
    }

    if (config.remove !== false) {
        table.remove();
    }

    Ext.applyIf(this, {
        "ds"       : ds,
        "cm"       : cm,
        "sm"       : new Ext.grid.RowSelectionModel(),
        autoHeight : true,
        autoWidth  : false
    });
    
    Ext.grid.TableGrid.superclass.constructor.call(this, ct, {});
};

Ext.extend(Ext.grid.TableGrid, Ext.grid.GridPanel);

Ext.reg("tablegrid", Ext.grid.TableGrid);

// @source data/RowNumberer.js

Ext.override(Ext.grid.RowNumberer, {
    renderer : function (v, p, record, rowIndex) {
        if (this.rowspan) {
            p.cellAttr = 'rowspan="' + this.rowspan + '"';
        }

        var so = record.store.lastOptions,
            sop = so ? so.params : null;
            
        return ((sop && sop.start) ? sop.start : 0) + rowIndex + 1;
    }
});

// @source data/CheckboxSelectionModel.js

Ext.override(Ext.grid.CheckboxSelectionModel, {
    allowDeselect : true,
    onMouseDown   : function (e, t) {
        
        if (e.button === 0 && (!this.checkOnly || (this.checkOnly && t.className == "x-grid3-row-checker")) && t.className != "x-grid3-row-expander" && !Ext.fly(t).hasClass("x-grid3-td-expander")) { 
            e.stopEvent();
            
            var row = e.getTarget(".x-grid3-row");
            
            if (row) {
                var index = row.rowIndex;
                
                if (this.isSelected(index)) {
                    if (!this.grid.enableDragDrop) {
                        if (this.allowDeselect === false) {
                            return;
                        }
                        
                        this.deselectRow(index);
                    } else {
                        this.deselectingFlag = true;
                    }
                } else {
                    if (this.grid.enableDragDrop) {
                        this.deselectingFlag = false;
                    }
                    
                    this.selectRow(index, true);
                }
            }
        }
    },
    
    handleMouseDown : Ext.emptyFn,

    uncheckHeader : function () {
        var view = this.grid.getView(),
            t = Ext.fly(view.innerHd).child(".x-grid3-hd-checker"),
            isChecked = t.hasClass("x-grid3-hd-checker-on");
            
        if (isChecked) {
            t.removeClass("x-grid3-hd-checker-on");
        }
    },

    toggleHeader : function () {
        var view = this.grid.getView(),
            t = Ext.fly(view.innerHd).child(".x-grid3-hd-checker"),
            isChecked = t.hasClass("x-grid3-hd-checker-on");
            
        if (isChecked) {
            t.removeClass("x-grid3-hd-checker-on");
        } else {
            t.addClass("x-grid3-hd-checker-on");
        }
    },

    checkHeader : function () {
        var view = this.grid.getView(),
            t = Ext.fly(view.innerHd).child(".x-grid3-hd-checker"),
            isChecked = t.hasClass("x-grid3-hd-checker-on");
            
        if (!isChecked) {
            t.addClass("x-grid3-hd-checker-on");
        }
    }
});

Ext.grid.CheckboxSelectionModel.prototype.initEvents = Ext.grid.CheckboxSelectionModel.prototype.initEvents.createSequence(function () {
    this.grid.on("rowclick", function (grid, rowIndex, e) {
        if (this.deselectingFlag && this.grid.enableDragDrop) {
            this.deselectingFlag = false;
            this.deselectRow(rowIndex);
        }
    }, this);
    
    this.on("rowdeselect", function () {
        this.uncheckHeader();
    });
    
    this.on("rowselect", function () {
        if (this.grid.store.getCount() === this.getSelections().length) {
            this.checkHeader();
        }
    });
});

// @source data/NumericPagingToolbar.js

Ext.ux.NumericPagingToolbar = function () {
    Ext.ux.NumericPagingToolbar.superclass.constructor.apply(this, arguments);
};

Ext.extend(Ext.ux.NumericPagingToolbar, Ext.PagingToolbar, {
    onRender : function (el, position) {
        Ext.PagingToolbar.prototype.onRender.apply(this, arguments);
        this.preceding = [];
        
        for (var i = 0; i < 3; i++) {
            this.preceding[i] = this.insertButton(i + 4, {
                handler : this.onPageNumberClick,
                scope   : this
            });
            
            this.preceding[i].el.setVisibilityMode(Ext.Element.DISPLAY);
            
            this.preceding[i].el.child(".x-btn-text").setStyle({
                "font-weight" : "bold",
                "color"       : "#083772"
            });
        }
        
        this.following = [];
        
        for (var j = 0; j < 3; j++) {
            this.following[j] = this.insertButton(j + 8, {
                handler : this.onPageNumberClick,
                scope   : this
            });
            
            this.following[j].el.setVisibilityMode(Ext.Element.DISPLAY);
            
            this.following[j].el.child(".x-btn-text").setStyle({
                "font-weight" : "bold",
                "color"       : "#083772"
            });
        }
    },

    onPageNumberClick : function (b, e) {
        var pageNum = parseInt(b.el.child(".x-btn-text").dom.innerHTML, 10),
            d = this.getPageData();
            
        if (!isNaN(pageNum) && (pageNum > 0) && (pageNum <= d.pages)) {
            this.field.dom.value = pageNum;
            pageNum--;
            this.store.load({ params : { start : pageNum * this.pageSize, limit : this.pageSize} });
        }
    },

    updateInfo : function () {
        Ext.PagingToolbar.prototype.updateInfo.apply(this, arguments);
        
        var d = this.getPageData(),
            p = d.activePage - 3;
            
        for (var i = 0; i < 3; i++, p++) {
            if (p < 1) {
                this.preceding[i].el.hide();
            } else {
                this.preceding[i].el.show();
                this.preceding[i].el.child(".x-btn-text").dom.innerHTML = p;
            }
        }
        
        p = d.activePage + 1;
        
        for (var j = 0; j < 3; j++, p++) {
            if (p > d.pages) {
                this.following[j].el.hide();
            } else {
                this.following[j].el.show();
                this.following[j].el.child(".x-btn-text").dom.innerHTML = p;
            }
        }
    }
});

Ext.reg("numpaging", Ext.ux.NumericPagingToolbar);

// @source data/ColumnModel.js

Ext.grid.ColumnModel.override({
    isMenuDisabled : function (col) {
        var column = this.config[col];
        
        if (Ext.isEmpty(column)) {
            return true;
        }
        
        return !!column.menuDisabled;
    },
    
    isSortable : function (col) {
        var column = this.config[col];
        
        if (Ext.isEmpty(column)) {
            return false;
        }
    
        if (typeof this.config[col].sortable == "undefined") {
            return this.defaultSortable;
        }
        
        return this.config[col].sortable;
    },
    
    isHidden : function (colIndex) {        
        return colIndex >= 0 && this.config[colIndex].hidden;
    },

    isFixed : function (colIndex) {
        return colIndex >= 0 && this.config[colIndex].fixed;
    }
});

// @source data/GridView.js

Ext.grid.GridView.prototype.initEvents = Ext.grid.GridView.prototype.initEvents.createSequence(function () {
    this.addEvents("afterRender");
});

Ext.grid.GridView.prototype.afterRender = Ext.grid.GridView.prototype.afterRender.createSequence(function () {
    this.fireEvent("afterRender", this);
});

Ext.grid.GridView.override({
    getCell : function (row, col) {
        var tds = this.getRow(row).getElementsByTagName("td"),
            ind = -1;
            
        if (tds) {
            for (var i = 0; i < tds.length; i++) {
                if (Ext.fly(tds[i]).hasClass("x-grid3-col x-grid3-cell")) {
                    ind++;
                    
                    if (ind == col) {
                        return tds[i];
                    }
                }
            }
        }
        return tds;
    },
    
    refreshRow : function (record) {
        var ds = this.ds, index;
        
        if (typeof record == "number") {
            index = record;
            record = ds.getAt(index);
            
            if (!record) {
                return;
            }
        } else {
            index = ds.indexOf(record);
            
            if (index < 0) {
                return;
            }
        }
        
        var cls = [];
        this.insertRows(ds, index, index, true);
        this.getRow(index).rowIndex = index;
        this.onRemove(ds, record, index + 1, true);
        this.fireEvent("rowupdated", this, index, record);
    }
});

// @source data/CommandColumn.js

Coolite.Ext.CommandColumn = function (config) {
    Ext.apply(this, config);
    
    if (!this.id) {
        this.id = Ext.id();
    }

    Coolite.Ext.CommandColumn.superclass.constructor.call(this); 
};

Ext.extend(Coolite.Ext.CommandColumn, Ext.util.Observable, {
    dataIndex    : "",
    header       : "",
    menuDisabled : true,
    sortable     : false,
    autoWidth    : false,

    init : function (grid) {
        this.grid = grid;
        
        var view = this.grid.getView(),
            func;
        
        view.rowSelectorDepth = 100;

        if (this.commands) {
            func = function () {
                this.insertToolbars();
                view.on("refresh", this.insertToolbars, this);
                view.on("beforerefresh", this.removeToolbars, this);
            };
            
            if (this.grid.rendered) {
                func.call(this);
            } else {
                view.on("afterRender", func, this);
            }

            view.on("beforerowremoved", this.removeToolbar, this);
            view.on("rowsinserted", this.insertToolbar, this);
            view.on("rowupdated", this.rowUpdated, this);
        }

        if (view.groupTextTpl && this.groupCommands) {
            func = function () {
                this.insertGroupToolbars();
                view.on("refresh", this.insertGroupToolbars, this);
                view.on("beforerefresh", this.removeGroupToolbars, this);
            };
            
            if (view.groupTextTpl && this.groupCommands) {
                view.groupTextTpl = '<div class="standart-view-group">' + view.groupTextTpl + '</div>';
            }

            if (this.grid.rendered) {
                func.call(this);
            } else {
                view.on("afterRender", func, this);
            }
        }
    },

    renderer : function (value, meta, record, row, col, store) {
        meta.css = "row-cmd-cell";
        return "";
    },

    insertToolbar : function (view, firstRow, lastRow) {
        this.insertToolbars(firstRow, lastRow + 1);
    },

    rowUpdated : function (view, firstRow, record) {
        this.insertToolbars(firstRow, firstRow + 1);
    },

    select : function () {
        var classSelector = "x-grid3-td-" + this.id + ".row-cmd-cell";
        return this.grid.getEl().query("td." + classSelector);
    },

    selectGroups : function () {
        return this.grid.getEl().query("div.x-grid-group div.x-grid-group-hd");
    },

    removeGroupToolbars : function () {
        var groupCmd = this.selectGroups();

        for (var i = 0; i < groupCmd.length; i++) {
            var div = Ext.fly(groupCmd[i]).first("div"),
                el = div.last();
                
            if (!Ext.isEmpty(el)) {
                var cmp = Ext.getCmp(el.id);
                
                Ext.Element.uncache(cmp);
                cmp.destroy();
            }
        }
    },

    insertGroupToolbars : function () {
        var groupCmd = this.selectGroups(),
            i;

        if (this.groupCommands) {
            for (i = 0; i < groupCmd.length; i++) {
                var toolbar = new Ext.Toolbar({
                        items : this.groupCommands
                    }),
                    div = Ext.fly(groupCmd[i]).first("div");
                    
                div.addClass("row-cmd-cell-ct");
                toolbar.render(div);

                var group = this.grid.view.findGroup(div),
                    groupId = group ? group.id.replace(/ext-gen[0-9]+-gp-/, "") : null,
                    records = this.getRecords(groupId);
                    
                if (this.prepareGroupToolbar && this.prepareGroupToolbar(this.grid, toolbar, groupId, records) === false) {
                    Ext.Element.uncache(toolbar);
                    toolbar.destroy();
                    continue;
                }

                toolbar.grid = this.grid;
                toolbar.groupId = groupId;

                toolbar.items.each(function (button) {
                    if (button.on) {
                        button.toolbar = toolbar;
                        button.column = this;

                        if (button.standOut) {
                            button.on("mouseout", function () { 
                                this.getEl().addClass("x-btn-over"); 
                            }, button);
                        }

                        if (!Ext.isEmpty(button.command, false)) {
                            button.on("click", function () {
                                this.toolbar.grid.fireEvent("groupcommand", this.command, this.toolbar.groupId, this.column.getRecords.apply(this.column, [this.toolbar.groupId]));
                            }, button);
                        }

                        if (button.menu) {
                            this.initGroupMenu(button.menu, toolbar);
                        }
                    }
                }, this);
            }
        }
    },

    initGroupMenu : function (menu, toolbar) {
        menu.items.each(function (item) {
            if (item.on) {
                item.toolbar = toolbar;
                item.column = this;

                if (!Ext.isEmpty(item.command, false)) {
                    item.on("click", function () {
                        this.toolbar.grid.fireEvent("groupcommand", this.command, this.toolbar.groupId, this.column.getRecords.apply(this.column, [this.toolbar.groupId]));
                    }, item);
                }

                if (item.menu) {
                    this.initGroupMenu(item.menu, toolbar);
                }
            }
        }, this);
    },

    getRecords : function (groupId) {
        if (groupId) {
            var re = new RegExp(RegExp.escape(groupId)),
                records = this.grid.store.queryBy(function (r) {
                    return r._groupId.match(re);
                });
                
            return records ? records.items : [];
        }
    },

    getAllGroupToolbars : function () {
        var groups = this.selectGroups(),
            toolbars = [],
            i;

        for (i = 0; i < groups.length; i++) {
            var div = Ext.fly(groups[i]).first("div"),
                el = div.last();
                
            if (!Ext.isEmpty(el)) {
                var cmp = Ext.getCmp(el.id);
                toolbars.push(cmp);
            }
        }

        return toolbars;
    },

    getGroupToolbar : function (groupId) {
        var groups = this.selectGroups(),
            i;

        for (i = 0; i < groups.length; i++) {
            var div = Ext.fly(groups[i]).first("div"),
                _group = this.grid.view.findGroup(div),
                _groupId = _group ? _group.id.replace(/ext-gen[0-9]+-gp-/, "") : null;

            if (_groupId == groupId) {
                var el = div.last();
                
                if (!Ext.isEmpty(el)) {
                    var cmp = Ext.getCmp(el.id);
                    return cmp;
                }
            }
        }

        return undefined;
    },

    insertToolbars : function (start, end) {
        var tdCmd = this.select(),
            width = 0;

        if (Ext.isEmpty(start) || Ext.isEmpty(end)) {
            start = 0;
            end = tdCmd.length;
        }

        if (this.commands) {
            for (var i = start; i < end; i++) {
                var toolbar = new Ext.Toolbar({
                        items : this.commands
                    }),
                    div = Ext.fly(tdCmd[i]).first("div");

                div.dom.innerHTML = "";
                div.addClass("row-cmd-cell-ct");

                toolbar.render(div);

                var record = this.grid.store.getAt(i);
                
                if (this.prepareToolbar && this.prepareToolbar(this.grid, toolbar, i, record) === false) {
                    Ext.Element.uncache(toolbar);
                    toolbar.destroy();
                    continue;
                }

                toolbar.grid = this.grid;
                toolbar.rowIndex = i;
                toolbar.record = record;

                toolbar.items.each(function (button) {
                    if (button.on) {
                        button.toolbar = toolbar;

                        if (button.standOut) {
                            button.on("mouseout", function () { 
                                this.getEl().addClass("x-btn-over"); 
                            }, button);
                        }

                        if (!Ext.isEmpty(button.command, false)) {
                            button.on("click", function () {
                                this.toolbar.grid.fireEvent("command", this.command, this.toolbar.record, this.toolbar.rowIndex);
                            }, button);
                        }

                        if (button.menu) {
                            this.initMenu(button.menu, toolbar);
                        }
                    }
                }, this);

                if (this.autoWidth) {
                    var tbTable = toolbar.getEl().first("table"),
                        tbWidth = tbTable.getComputedWidth();
                        
                    width = tbWidth > width ? tbWidth : width;
                }
            }

            if (this.autoWidth && width > 0) {
                var cm = this.grid.getColumnModel();
                cm.setColumnWidth(cm.getIndexById(this.id), width + 4);
                this.grid.view.autoExpand();
            }
        }
    },

    initMenu : function (menu, toolbar) {
        menu.items.each(function (item) {
            if (item.on) {
                item.toolbar = toolbar;

                if (!Ext.isEmpty(item.command, false)) {
                    item.on("click", function () {
                        this.toolbar.grid.fireEvent("command", this.command, this.toolbar.record, this.toolbar.rowIndex);
                    }, item);
                }

                if (item.menu) {
                    this.initMenu(item.menu, toolbar);
                }
            }
        }, this);
    },

    removeToolbar : function (view, rowIndex) {
        var tdCmd = this.select(),
            div = Ext.fly(tdCmd[rowIndex]).first("div"),
            el = div.first();
            
        if (!Ext.isEmpty(el)) {
            var cmp = Ext.getCmp(el.id);
            Ext.Element.uncache(cmp);
            cmp.destroy();
        }
    },

    removeToolbars : function () {
        var tdCmd = this.select();

        for (var i = 0; i < tdCmd.length; i++) {
            var div = Ext.fly(tdCmd[i]).first("div"),
                el = div.first();
                
            if (!Ext.isEmpty(el)) {
                var cmp = Ext.getCmp(el.id);
                Ext.Element.uncache(cmp);
                cmp.destroy();
            }
        }
    },

    getToolbar : function (rowIndex) {
        var tdCmd = this.select(),
            div = Ext.fly(tdCmd[rowIndex]).first("div"),
            el = div.first();
            
        if (!Ext.isEmpty(el)) {
            var cmp = Ext.getCmp(el.id);
            return cmp;
        }

        return undefined;
    },

    getAllToolbars : function () {
        var tdCmd = this.select(),
            toolbars = [];

        for (var i = 0; i < tdCmd.length; i++) {
            var div = Ext.fly(tdCmd[i]).first("div"),
                el = div.first();
                
            if (!Ext.isEmpty(el)) {
                var cmp = Ext.getCmp(el.id);
                toolbars.push(cmp);
            }
        }

        return toolbars;
    },
    
    destroy : function () {
        var view = this.grid.getView();
        view.un("refresh", this.insertToolbars, this);
        view.un("beforerefresh", this.removeToolbars, this);
        view.un("beforerowremoved", this.removeToolbar, this);
        view.un("rowsinserted", this.insertToolbar, this);
        view.un("rowupdated", this.rowUpdated, this);
		view.un("refresh", this.insertGroupToolbars, this);
        view.un("beforerefresh", this.removeGroupToolbars, this);
    }
});

// @source data/ImageCommandColumn.js

Coolite.Ext.ImageCommandColumn = function (config) {
    Ext.apply(this, config);
    
    if (!this.id) {
        this.id = Ext.id();
    }

    this.renderer = this.renderer.createDelegate(this);

    Coolite.Ext.ImageCommandColumn.superclass.constructor.call(this);    
};

Ext.extend(Coolite.Ext.ImageCommandColumn, Ext.util.Observable, {
    dataIndex    : "",
    header       : "",
    menuDisabled : true,
    sortable     : false,

    init : function (grid) {
        this.grid = grid;

        var view = this.grid.getView();
        
        this.grid.afterRender = grid.afterRender.createSequence(function () {
            view.mainBody.on("click", this.onClick, this);
        }, this);

        if (view.groupTextTpl && this.groupCommands) {
            view.interceptMouse = view.interceptMouse.createInterceptor(function (e) {
                if (e.getTarget(".group-row-imagecommand")) {
                    return false;
                }
            });

            view.doGroupStart = view.doGroupStart.createInterceptor(function (buf, group, cs, store, colCount) {
                var preparedCommands = [], 
                    i,
                    groupCommands = this.commandColumn.groupCommands;
                    
                group.cls = (group.cls || "") + " group-imagecmd-ct";
                var groupId = group ? group.groupId.replace(/ext-gen[0-9]+-gp-/, "") : null;
                
                if (this.commandColumn.prepareGroupCommands) {  
                    groupCommands = Coolite.Ext.clone(this.commandColumn.groupCommands);
                    this.commandColumn.prepareGroupCommands(this.grid, groupCommands, groupId, group);
                }
                
                for (i = 0; i < groupCommands.length; i++) {
                    var cmd = groupCommands[i];
                    
                    cmd.tooltip = cmd.tooltip || {};
                    
                    var command = {
                        command    : cmd.command,
                        cls        : cmd.cls,
                        iconCls    : cmd.iconCls,
                        hidden     : cmd.hidden,
                        text       : cmd.text,
                        style      : cmd.style,
                        qtext      : cmd.tooltip.text,
                        qtitle     : cmd.tooltip.title,
                        hideMode   : cmd.hideMode,
                        rightAlign : cmd.rightAlign || false
                    };                  
                    
                    if (this.commandColumn.prepareGroupCommand) {
                        this.commandColumn.prepareGroupCommand(this.grid, command, groupId, group);
                    }

                    if (command.hidden) {
                        var hideMode = command.hideMode || "display";
                        command.hideCls = "x-hide-" + hideMode;
                    }

                    if (command.rightAlign) {
                        command.align = "right-group-imagecommand";
                    } else {
                        command.align = "";
                    }

                    preparedCommands.push(command);
                }
                group.commands = preparedCommands;
            });
            
            view.groupTextTpl = '<div class="group-row-imagecommand-cell">' + view.groupTextTpl + '</div>' + this.groupCommandTemplate;
            view.commandColumn = this;
        }
    },

    renderer : function (value, meta, record, row, col, store) {
        meta.css = meta.css || "";
        meta.css += " row-imagecommand-cell";

        if (this.commands) {
            var preparedCommands = [],
                commands = this.commands;
            
            if (this.prepareCommands) {                
                commands = Coolite.Ext.clone(this.commands);
                this.prepareCommands(this.grid, commands, record, row);
            }            
            
            for (var i = 0; i < commands.length; i++) {
                var cmd = commands[i];
                
                cmd.tooltip = cmd.tooltip || {};
                
                var command = {
                    command  : cmd.command,
                    cls      : cmd.cls,
                    iconCls  : cmd.iconCls,
                    hidden   : cmd.hidden,
                    text     : cmd.text,
                    style    : cmd.style,
                    qtext    : cmd.tooltip.text,
                    qtitle   : cmd.tooltip.title,
                    hideMode : cmd.hideMode
                };                
                
                if (this.prepareCommand) {
                    this.prepareCommand(this.grid, command, record, row);
                }

                if (command.hidden) {
                    var hideMode = command.hideMode || "display";
                    command.hideCls = "x-hide-" + hideMode;
                }
                
                if (Ext.isIE6 && Ext.isEmpty(cmd.text, false)) {
                    command.noTextCls = "no-row-imagecommand-text";
                }

                preparedCommands.push(command);
            }
            
            return this.getRowTemplate().apply({ commands : preparedCommands });
        }
        return "";
    },

    commandTemplate :
		'<div class="row-imagecommands">' +
		  '<tpl for="commands">' +
		     '<div cmd="{command}" class="row-imagecommand {cls} {noTextCls} {iconCls} {hideCls}" ' +
		     'style="{style}" ext:qtip="{qtext}" ext:qtitle="{qtitle}">' +
		        '<tpl if="text"><span ext:qtip="{qtext}" ext:qtitle="{qtitle}">{text}</span></tpl>' +
		     '</div>' +
		  '</tpl>' +
		'</div>',

    groupCommandTemplate :
		 '<tpl for="commands">' +
		    '<div cmd="{command}" class="group-row-imagecommand {cls} {iconCls} {hideCls} {align}" ' +
		      'style="{style}" ext:qtip="{qtext}" ext:qtitle="{qtitle}"><span ext:qtip="{qtext}" ext:qtitle="{qtitle}">{text}</span></div>' +
		 '</tpl>',

    getRowTemplate : function () {
        if (Ext.isEmpty(this.rowTemplate)) {
            this.rowTemplate = new Ext.XTemplate(this.commandTemplate);
        }

        return this.rowTemplate;
    },

    onClick : function (e, target) {
        var view = this.grid.getView(), 
            cmd,
            t = e.getTarget(".row-imagecommand");
            
        if (t) {
            cmd = Ext.fly(t).getAttributeNS("", "cmd");
            
            if (Ext.isEmpty(cmd, false)) {
                return;
            }
            
            var row = e.getTarget(".x-grid3-row");
            
            if (row === false) {
                return;
            }
            
            var colIndex = this.grid.view.findCellIndex(target.parentNode.parentNode);
            
            if (colIndex !== this.grid.getColumnModel().getIndexById(this.id)) {
                return;
            }

            this.grid.fireEvent("command", cmd, this.grid.store.getAt(row.rowIndex), row.rowIndex, colIndex);
        }

        t = e.getTarget(".group-row-imagecommand");
        
        if (t) {
            var group = view.findGroup(target),
                groupId = group ? group.id.replace(/ext-gen[0-9]+-gp-/, "") : null;
                
            cmd = Ext.fly(t).getAttributeNS("", "cmd");
            
            if (Ext.isEmpty(cmd, false)) {
                return;
            }

            this.grid.fireEvent("groupcommand", cmd, groupId, this.getRecords(groupId));
        }
    },

    getRecords : function (groupId) {
        if (groupId) {
            var re = new RegExp(RegExp.escape(groupId)),
                records = this.grid.store.queryBy(function (record) {
                    return record._groupId.match(re);
                });
                
            return records ? records.items : [];
        }
        
        return [];
    },
    
    destroy : function () {
        this.grid.getView().mainBody.un("click", this.onClick, this);
    }
});

// @source data/CellCommands.js

Coolite.Ext.CellCommands = function (config) {
    Ext.apply(this, config);
    Coolite.Ext.CellCommands.superclass.constructor.call(this);    
};

Ext.extend(Coolite.Ext.CellCommands, Ext.util.Observable, {
    commandTemplate :
		'<div class="cell-imagecommands <tpl if="rightValue === true">cell-imagecommand-right-value</tpl>">' +
		  '<tpl if="rightAlign === true && rightValue === false"><div class="cell-imagecommand-value">{value}</div></tpl>' +
		  '<tpl for="commands">' +
		     '<div cmd="{command}" class="cell-imagecommand <tpl if="parent.rightAlign === false">left-cell-imagecommand</tpl> {cls} {iconCls} {hideCls}" ' +
		     'style="{style}" ext:qtip="{qtext}" ext:qtitle="{qtitle}">' +
		        '<tpl if="text"><span ext:qtip="{qtext}" ext:qtitle="{qtitle}">{text}</span></tpl>' +
		     '</div>' +
		  '</tpl>' +
		  '<tpl if="rightAlign === false || rightValue === true"><div class="cell-imagecommand-value">{value}</div></tpl>' +
		'</div>',

    getTemplate : function () {
        if (Ext.isEmpty(this.template)) {
            this.template = new Ext.XTemplate(this.commandTemplate);
        }

        return this.template;
    },

    init : function (grid) {
        this.grid = grid;

        var view = this.grid.getView();
        
        this.grid.afterRender = grid.afterRender.createSequence(function () {
            view.mainBody.on("click", this.onClick, this);
        }, this);

        var cm = this.grid.getColumnModel(),
            i;
        
        for (i = 0; i < cm.config.length; i++) {
            var column = cm.config[i];
            
            if (!column.expandRow) {
                column.userRenderer = cm.getRenderer(i);
                column.renderer = this.renderer.createDelegate(this);
            }
        }
    },

    renderer : function (value, meta, record, row, col, store) {
        var column = this.grid.getColumnModel().config[col];

        if (column.commands && column.commands.length > 0 && column.isCellCommand) {
            var rightAlign = column.rightCommandAlign === false ? false : true,
                preparedCommands = [],
                commands = column.commands;
                
            if (column.prepareCommands) {                
                commands = Coolite.Ext.clone(column.commands);
                column.prepareCommands(this.grid, commands, record, row, col, value);
            }    
                
            for (var i = rightAlign ? (commands.length - 1) : 0; rightAlign ? (i >= 0) : (i < commands.length); rightAlign ? i-- : i++) {
                var cmd = commands[i];
                
                cmd.tooltip = cmd.tooltip || {};
                
                var command = {
                    command  : cmd.command,
                    cls      : cmd.cls,
                    iconCls  : cmd.iconCls,
                    hidden   : cmd.hidden,
                    text     : cmd.text,
                    style    : cmd.style,
                    qtext    : cmd.tooltip.text,
                    qtitle   : cmd.tooltip.title,
                    hideMode : cmd.hideMode
                };

                if (column.prepareCommand) {
                    column.prepareCommand(this.grid, command, record, row, col, value);
                }

                if (command.hidden) {
                    command.hideCls = "x-hide-" + (command.hideMode || "display");
                }

                preparedCommands.push(command);
            }

            var userRendererValue = column.userRenderer(value, meta, record, row, col, store);

            return this.getTemplate().apply({
                commands   : preparedCommands,
                value      : userRendererValue,
                rightAlign : rightAlign,
                rightValue : column.align == "right"
            });
        } else {
            meta.css = meta.css || "";
            meta.css += " cell-no-imagecommand";
        }

        return column.userRenderer(value, meta, record, row, col, store);
    },

    onClick : function (e, target) {

        var view = this.grid.getView(),
            t = e.getTarget(".cell-imagecommand");

        if (t) {
            var cmd = Ext.fly(t).getAttributeNS("", "cmd");
            
            if (Ext.isEmpty(cmd, false)) {
                return;
            }
            
            var row = e.getTarget(".x-grid3-row");
            
            if (row === false) {
                return;
            }

            var col = view.findCellIndex(target.parentNode.parentNode),
                record = this.grid.store.getAt(row.rowIndex);

            this.grid.fireEvent("command", cmd, record, row.rowIndex, col);
        }
    }
});

// @source data/init/End.js

if (typeof Sys !== "undefined") { 
    Sys.Application.notifyScriptLoaded();
}
