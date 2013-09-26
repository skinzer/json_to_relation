'''
Created on Sep 23, 2013

@author: paepcke
'''
import StringIO
import ijson
import re

from col_data_type import ColDataType


class GenericJSONParser(object):
    '''
    Takes a JSON string, and returns a CSV row for later import into a relational database. 
    '''
    # Regex pattern to remove '.item.' from column header names.
    # (see removeItemFromString(). Example: employee.item.name
    # will be replaced by employee.name. When used in r.search(),
    # the regex below creates a Match result instance with two
    # groups: 'item' and 'name'.
    REMOVE_ITEM_FROM_STRING_PATTERN = re.compile(r'(item)\.([^.]*$)')

    def __init__(self, jsonToRelationConverter):
        '''
        Constructor
        '''
        self.jsonToRelationConverter = jsonToRelationConverter
    
    def processOneJSONObject(self, jsonStr, row):
        '''
   	    ('null', None)
		('boolean', <True or False>)
		('number', <int or Decimal>)
		('string', <unicode>)
		('map_key', <str>)
		('start_map', None)
		('end_map', None)
		('start_array', None)
		('end_array', None)
		        
		@param jsonStr: string of a single, self contained JSON object
		@type jsonStr: String
        '''
        parser = ijson.parse(StringIO.StringIO(jsonStr))
        # Stack of array index counters for use with
        # nested arrays:
        arrayIndexStack = Stack()
        # Not currently processing 
        #for prefix,event,value in self.parser:
        for nestedLabel, event, value in parser:
            #print("Nested label: %s; event: %s; value: %s" % (nestedLabel,event,value))
            if event == "start_map":
                if not arrayIndexStack.empty():
                    # Starting a new attribute/value pair within an array: need
                    # a new number to differentiate column headers                    
                    self.incArrayIndex(arrayIndexStack)
                continue
            
            if (len(nestedLabel) == 0) or\
               (event == "map_key") or\
               (event == "end_map"):
                continue
            
            if not arrayIndexStack.empty():
                # Label is now something like
                # employees.item.firstName. The 'item' is ijson's way of indicating
                # that we are in an array. Remove the '.item.' part; it makes
                # the relation column header unnecessarily long. Then append 
                # our array index number with an underscore:
                nestedLabel = self.removeItemPartOfString(nestedLabel) +\
                              '_' +\
                              str(arrayIndexStack.top(exceptionOnEmpty=True))
            
            # Ensure that label contains only MySQL-legal identifier chars. Else
            # quote the label:                
            nestedLabel = self.jsonToRelationConverter.ensureLegalIdentifierChars(nestedLabel)
            
            # Check whether caller gave a type hint for this column:
            try:
                colDataType = self.jsonToRelationConverter.schemaHints[nestedLabel]
            except KeyError:
                colDataType = None
            
            if event == "string":
                if colDataType is None:
                    colDataType = ColDataType.TEXT
                self.jsonToRelationConverter.ensureColExistence(nestedLabel, colDataType)
                self.setValInRow(row, nestedLabel, value)
                continue

            if event == "boolean":
                raise NotImplementedError("Boolean not yet implemented");
                continue 

            if event == "number":
                if colDataType is None:
                    colDataType = ColDataType.DOUBLE
                self.jsonToRelationConverter.ensureColExistence(nestedLabel, colDataType)
                self.setValInRow(row, nestedLabel,value)
                continue

            if event == "null":
                if colDataType is None:
                    colDataType = ColDataType.TEXT
                self.jsonToRelationConverter.ensureColExistence(nestedLabel, colDataType)
                self.setValInRow(row, nestedLabel, '')
                continue

            if event == "start_array":
                # New array index entry for this nested label.
                # Used to generate <label>_0, <label>_1, etc. for
                # column names:
                arrayIndexStack.push(-1)
                continue

            if event == "end_array":
                # Array closed; forget the array counter:
                arrayIndexStack.pop()
                continue

            raise ValueError("Unknown JSON value type at %s for value %s (ijson event: %s)" % (nestedLabel,value,str(event))) 
        return row

    def setValInRow(self, theRow, colName, value):
        '''
        Given a column name, a value and a partially filled row,
        add the column to the row, or set the value in an already
        existing row.
        @param theRow: list of values in their proper column positions
        @type theRow: List<<any>>
        @param colName: name of column into which value is to be inserted.
        @type colName: String
        @param value: the field value
        @type value: <any>, as per ColDataType
        '''
        colSpec = self.jsonToRelationConverter.cols[colName]
        targetPos = colSpec.colPos
        # Is value to go just beyond the current row len?
        if (len(theRow) == 0 or len(theRow) == targetPos):
            theRow.append(value)
            return theRow
        # Is value to go into an already existing column?
        if (len(theRow) > targetPos):
            theRow[targetPos] = value
            return theRow
        
        # Adding a column beyond the current end of the row, but
        # not just by one position.
        # Won't usually happen, as we just keep adding cols as
        # we go, but taking care of this case makes for flexibility:
        # Make a list that spans the missing columns, and fill
        # it with nulls; then concat that list with theRow:
        fillList = ['null']*(targetPos - len(theRow))
        fillList.append(value)
        theRow.extend(fillList)
        return theRow


    def incArrayIndex(self, arrayIndexStack):
        currArrayIndex = arrayIndexStack.pop()
        currArrayIndex += 1
        arrayIndexStack.push(currArrayIndex)

    def decArrayIndex(self, arrayIndexStack):
        currArrayIndex = arrayIndexStack.pop()
        currArrayIndex -= 1
        arrayIndexStack.push(currArrayIndex)

    def removeItemPartOfString(self, label):
        '''
        Given a label, like employee.item.name, remove the last
        occurrence of 'item'
        @param label: string from which last 'item' occurrence is to be removed
        @type label: String
        '''
        # JSONToRelation.REMOVE_ITEM_FROM_STRING_PATTERN is a regex pattern to remove '.item.' 
        # from column header names. Example: employee.item.name
        # will be replaced by employee.name. When used in r.search(),
        # the regex below creates a Match result instance with two
        # groups: 'item' and 'name'.
        match = re.search(GenericJSONParser.REMOVE_ITEM_FROM_STRING_PATTERN, label)        
        if match is None:
            # no appropriate occurrence of 'item' fround
            return label
        # Get label portion up to last occurrence of 'item',
        # and add the last part of the label to that part: 
        res = label[:match.start(1)] + match.group(2)
        return res

class Stack(object):
    
    def __init__(self):
        self.stackArray = []

    def empty(self):
        return len(self.stackArray) == 0
        
    def push(self, item):
        self.stackArray.append(item)
        
    def pop(self):
        try:
            return self.stackArray.pop()
        except IndexError:
            raise ValueError("Stack empty.")
    
    def top(self, exceptionOnEmpty=False):
        if len(self.stackArray) == 0:
            if exceptionOnEmpty:
                raise ValueError("Call to Stack instance method 'top' when stack is empty.")
            else:
                return None
        return self.stackArray[len(self.stackArray) -1]
    
    def stackHeight(self):
        return len(self.stackArray)
    
    